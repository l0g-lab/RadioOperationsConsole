//! ICS 214 activity logs (docs/features/ics-form-exports.md, ICSF-050–056):
//! a period of operation, its header fields, and its log lines — those made
//! from the records and those added or changed by hand — kept so the
//! operator's edits survive closing the window and exporting again. The lines
//! are made and merged in the interface (src/ics214.ts); this stores and
//! checks them.

use crate::repo::Repository;
use chrono::{DateTime, Utc};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A row of section 6, Resources Assigned.
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Default)]
pub struct Resource {
    pub name: String,
    pub position: String,
    pub agency: String,
}

/// A line of section 7, the activity log.
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Default)]
pub struct LogLine {
    /// RFC 3339.
    pub at: String,
    pub text: String,
    /// The record a line was made from ("start:<activity id>"), or None for
    /// one added by hand.
    #[serde(default)]
    pub source: Option<String>,
}

/// What the operator enters for a log.
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Default)]
pub struct Ics214Details {
    pub incident_name: String,
    pub period_from: String,
    pub period_to: String,
    pub name: String,
    pub ics_position: String,
    pub home_agency: String,
    pub prepared_name: String,
    pub resources: Vec<Resource>,
    pub excluded_activities: Vec<String>,
    pub lines: Vec<LogLine>,
    /// Sources of generated lines the operator deleted, so a refresh doesn't
    /// bring them back.
    pub dismissed: Vec<String>,
    /// The event this is the log of (events.rs), if any.
    #[serde(default)]
    pub event_id: Option<String>,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Ics214Log {
    pub id: String,
    #[serde(flatten)]
    pub details: Ics214Details,
    pub updated_at: String,
}

/// The form holds 8 resource rows.
pub const MAX_RESOURCES: usize = 8;

fn instant(v: &str, what: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(v.trim())
        .map(|d| d.with_timezone(&Utc))
        .map_err(|_| format!("The {what} isn't a valid date and time."))
}

/// Checks and tidies what was entered: a period that ends after it starts,
/// lines with a time and some text, in time order (ICSF-050, ICSF-053).
pub fn clean(mut d: Ics214Details) -> Result<Ics214Details, String> {
    for text in [&mut d.incident_name, &mut d.name, &mut d.ics_position, &mut d.home_agency, &mut d.prepared_name] {
        *text = text.trim().to_string();
    }
    if d.incident_name.is_empty() {
        return Err("Give the incident or event a name.".into());
    }
    let from = instant(&d.period_from, "start of the period")?;
    let to = instant(&d.period_to, "end of the period")?;
    if to <= from {
        return Err("The period should end after it starts.".into());
    }
    d.period_from = from.to_rfc3339();
    d.period_to = to.to_rfc3339();

    for r in &mut d.resources {
        r.name = r.name.trim().to_string();
        r.position = r.position.trim().to_string();
        r.agency = r.agency.trim().to_string();
    }
    d.resources.retain(|r| !(r.name.is_empty() && r.position.is_empty() && r.agency.is_empty()));
    if d.resources.len() > MAX_RESOURCES {
        return Err(format!("The form has room for {MAX_RESOURCES} resources."));
    }

    let mut lines = Vec::with_capacity(d.lines.len());
    for line in d.lines {
        let text = line.text.trim().to_string();
        if text.is_empty() {
            continue;
        }
        let at = instant(&line.at, "time of a log line")?;
        lines.push((at, LogLine { at: at.to_rfc3339(), text, source: line.source.filter(|s| !s.is_empty()) }));
    }
    // Stable, so lines at the same time keep the order they were given.
    lines.sort_by_key(|(at, _)| *at);
    d.lines = lines.into_iter().map(|(_, l)| l).collect();
    d.dismissed.sort();
    d.dismissed.dedup();
    d.event_id = d.event_id.filter(|e| !e.trim().is_empty());
    Ok(d)
}

const COLS: &str = "id, incident_name, period_from, period_to, coalesce(name,''), coalesce(ics_position,''), coalesce(home_agency,''), coalesce(prepared_name,''), resources, excluded_activities, lines, dismissed, updated_at, event_id";

fn json<T: for<'de> Deserialize<'de>>(v: String) -> rusqlite::Result<T> {
    serde_json::from_str(&v).map_err(|e| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e)))
}

fn to_json<T: Serialize>(v: &T) -> String {
    serde_json::to_string(v).unwrap_or_else(|_| "[]".into())
}

fn map(r: &rusqlite::Row) -> rusqlite::Result<Ics214Log> {
    Ok(Ics214Log {
        id: r.get(0)?,
        details: Ics214Details {
            incident_name: r.get(1)?,
            period_from: r.get(2)?,
            period_to: r.get(3)?,
            name: r.get(4)?,
            ics_position: r.get(5)?,
            home_agency: r.get(6)?,
            prepared_name: r.get(7)?,
            resources: json(r.get(8)?)?,
            excluded_activities: json(r.get(9)?)?,
            lines: json(r.get(10)?)?,
            dismissed: json(r.get(11)?)?,
            event_id: r.get(13)?,
        },
        updated_at: r.get(12)?,
    })
}

fn blank(s: &str) -> Option<&str> {
    if s.is_empty() { None } else { Some(s) }
}

impl Repository {
    /// Saved logs, newest period first.
    pub fn list_ics214_logs(&self) -> rusqlite::Result<Vec<Ics214Log>> {
        let mut stmt = self
            .conn
            .prepare(&format!("SELECT {COLS} FROM ics214_logs ORDER BY period_from DESC"))?;
        let rows = stmt.query_map([], map)?;
        rows.collect()
    }

    pub fn get_ics214_log(&self, id: &str) -> rusqlite::Result<Ics214Log> {
        self.conn
            .query_row(&format!("SELECT {COLS} FROM ics214_logs WHERE id = ?1"), params![id], map)
    }

    /// Adds a log (already checked with `clean`).
    pub fn create_ics214_log(&self, d: &Ics214Details) -> rusqlite::Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO ics214_logs(id, incident_name, period_from, period_to, name, ics_position, home_agency, prepared_name, resources, excluded_activities, lines, dismissed, created_at, updated_at, event_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13,?14)",
            params![id, d.incident_name, d.period_from, d.period_to, blank(&d.name), blank(&d.ics_position), blank(&d.home_agency), blank(&d.prepared_name), to_json(&d.resources), to_json(&d.excluded_activities), to_json(&d.lines), to_json(&d.dismissed), now, d.event_id],
        )?;
        Ok(id)
    }

    /// Replaces a log's details (already checked with `clean`).
    pub fn update_ics214_log(&self, id: &str, d: &Ics214Details) -> rusqlite::Result<()> {
        let n = self.conn.execute(
            "UPDATE ics214_logs SET incident_name = ?1, period_from = ?2, period_to = ?3, name = ?4, ics_position = ?5, home_agency = ?6, prepared_name = ?7, resources = ?8, excluded_activities = ?9, lines = ?10, dismissed = ?11, updated_at = ?12, event_id = ?14 WHERE id = ?13",
            params![d.incident_name, d.period_from, d.period_to, blank(&d.name), blank(&d.ics_position), blank(&d.home_agency), blank(&d.prepared_name), to_json(&d.resources), to_json(&d.excluded_activities), to_json(&d.lines), to_json(&d.dismissed), Utc::now().to_rfc3339(), id, d.event_id],
        )?;
        if n == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn delete_ics214_log(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute("DELETE FROM ics214_logs WHERE id = ?1", params![id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> Repository {
        let path = std::env::temp_dir().join(format!("roc-214-{}.db", Uuid::new_v4()));
        Repository::new(crate::db::open_db(&path).unwrap())
    }

    fn set() -> Ics214Details {
        Ics214Details {
            incident_name: " SET 2026 ".into(),
            period_from: "2026-10-03T09:00:00-04:00".into(),
            period_to: "2026-10-03T12:00:00-04:00".into(),
            name: "Pat Jones K4NCS".into(),
            resources: vec![
                Resource { name: "Bob W1AW".into(), position: "Relay".into(), agency: "ARES".into() },
                Resource::default(),
            ],
            lines: vec![
                LogLine { at: "2026-10-03T10:15:00-04:00".into(), text: "Delivered inject #1".into(), source: None },
                LogLine { at: "2026-10-03T09:00:00-04:00".into(), text: " Opened ham net ".into(), source: Some("start:a1".into()) },
                LogLine { at: "2026-10-03T09:05:00-04:00".into(), text: "  ".into(), source: None },
            ],
            dismissed: vec!["end:a1".into(), "end:a1".into()],
            ..Default::default()
        }
    }

    #[test]
    fn a_log_is_checked_tidied_and_put_in_time_order() {
        let d = clean(set()).unwrap();
        assert_eq!(d.incident_name, "SET 2026");
        assert_eq!(d.period_from, "2026-10-03T13:00:00+00:00", "stored as UTC");
        // Blank resource rows and blank lines are dropped; lines are in time order.
        assert_eq!(d.resources.len(), 1);
        assert_eq!(d.lines.iter().map(|l| l.text.as_str()).collect::<Vec<_>>(), ["Opened ham net", "Delivered inject #1"]);
        assert_eq!(d.lines[0].source.as_deref(), Some("start:a1"));
        assert_eq!(d.dismissed, ["end:a1"]);

        let bad = |f: fn(&mut Ics214Details)| {
            let mut d = set();
            f(&mut d);
            clean(d).unwrap_err()
        };
        assert!(bad(|d| d.incident_name = " ".into()).contains("name"));
        assert!(bad(|d| d.period_to = d.period_from.clone()).contains("end after"));
        assert!(bad(|d| d.period_from = "9am".into()).contains("start of the period"));
        assert!(bad(|d| d.lines[0].at = "later".into()).contains("log line"));
        assert!(bad(|d| d.resources = vec![Resource { name: "x".into(), ..Default::default() }; 9]).contains("8 resources"));
    }

    #[test]
    fn logs_are_saved_edited_and_deleted() {
        let r = repo();
        let d = clean(set()).unwrap();
        let id = r.create_ics214_log(&d).unwrap();
        assert_eq!(r.get_ics214_log(&id).unwrap().details, d);

        let mut changed = d.clone();
        changed.lines.push(LogLine { at: "2026-10-03T11:15:00+00:00".into(), text: "Inject #2".into(), source: None });
        r.update_ics214_log(&id, &changed).unwrap();
        assert_eq!(r.get_ics214_log(&id).unwrap().details.lines.len(), 3);
        assert!(r.update_ics214_log("missing", &changed).is_err());

        assert_eq!(r.list_ics214_logs().unwrap().len(), 1);
        r.delete_ics214_log(&id).unwrap();
        assert!(r.list_ics214_logs().unwrap().is_empty());
    }
}
