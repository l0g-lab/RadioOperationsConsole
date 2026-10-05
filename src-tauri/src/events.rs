//! Events (docs/features/events.md): a named occasion, such as an exercise,
//! holding the activities run for it and its ICS 214 activity log.

use crate::repo::Repository;
use chrono::{NaiveDate, Utc};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Event {
    pub id: String,
    pub name: String,
    /// YYYY-MM-DD, or empty.
    #[serde(default)]
    pub date: String,
}

/// Checks and tidies what was entered for an event (EVT-001).
pub fn clean(name: &str, date: &str) -> Result<(String, Option<String>), String> {
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return Err("Give the event a name.".into());
    }
    let date = date.trim();
    if date.is_empty() {
        return Ok((name, None));
    }
    NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| "Enter the date as YYYY-MM-DD.".to_string())?;
    Ok((name, Some(date.to_string())))
}

impl Repository {
    pub fn list_events(&self) -> rusqlite::Result<Vec<Event>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, coalesce(date,'') FROM events ORDER BY coalesce(date,''), name")?;
        let rows = stmt.query_map([], |r| Ok(Event { id: r.get(0)?, name: r.get(1)?, date: r.get(2)? }))?;
        rows.collect()
    }

    pub fn get_event(&self, id: &str) -> rusqlite::Result<Event> {
        self.conn.query_row(
            "SELECT id, name, coalesce(date,'') FROM events WHERE id = ?1",
            params![id],
            |r| Ok(Event { id: r.get(0)?, name: r.get(1)?, date: r.get(2)? }),
        )
    }

    /// Adds an event, or changes one's name and date (already checked with `clean`).
    pub fn save_event(&self, id: Option<&str>, name: &str, date: Option<&str>) -> rusqlite::Result<String> {
        match id {
            Some(id) => {
                let n = self
                    .conn
                    .execute("UPDATE events SET name = ?1, date = ?2 WHERE id = ?3", params![name, date, id])?;
                if n == 0 {
                    return Err(rusqlite::Error::QueryReturnedNoRows);
                }
                Ok(id.to_string())
            }
            None => {
                let id = Uuid::new_v4().to_string();
                self.conn.execute(
                    "INSERT INTO events(id, name, date, created_at) VALUES (?1, ?2, ?3, ?4)",
                    params![id, name, date, Utc::now().to_rfc3339()],
                )?;
                Ok(id)
            }
        }
    }

    /// Removes an event. Its activities and its activity log are kept, no
    /// longer part of any event.
    pub fn delete_event(&self, id: &str) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("UPDATE activities SET event_id = NULL WHERE event_id = ?1", params![id])?;
        tx.execute("UPDATE ics214_logs SET event_id = NULL WHERE event_id = ?1", params![id])?;
        tx.execute("DELETE FROM events WHERE id = ?1", params![id])?;
        tx.commit()
    }

    /// Puts an activity in an event, or takes it out (None).
    pub fn set_activity_event(&self, activity_id: &str, event_id: Option<&str>) -> rusqlite::Result<()> {
        let n = self
            .conn
            .execute("UPDATE activities SET event_id = ?1 WHERE id = ?2", params![event_id, activity_id])?;
        if n == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> Repository {
        let path = std::env::temp_dir().join(format!("roc-events-{}.db", Uuid::new_v4()));
        Repository::new(crate::db::open_db(&path).unwrap())
    }

    #[test]
    fn events_are_checked() {
        assert_eq!(clean("  ARRL   2026 SET ", "").unwrap(), ("ARRL 2026 SET".into(), None));
        assert_eq!(clean("SET", "2026-10-03").unwrap().1.as_deref(), Some("2026-10-03"));
        assert!(clean(" ", "").is_err());
        assert!(clean("SET", "Oct 3").is_err());
    }

    #[test]
    fn activities_join_and_leave_an_event_and_outlive_it() {
        let r = repo();
        let e = r.save_event(None, "ARRL 2026 SET", Some("2026-10-03")).unwrap();
        let a = r.create_activity("Ham net", "directed_net", None, None).unwrap();
        r.set_activity_event(&a, Some(&e)).unwrap();
        let act = r.get_activity(&a).unwrap();
        assert_eq!((act.event_id.as_str(), act.event.as_str()), (e.as_str(), "ARRL 2026 SET"));

        r.save_event(Some(&e), "SET 2026", None).unwrap();
        assert_eq!(r.get_activity(&a).unwrap().event, "SET 2026", "renaming the event renames it everywhere");

        r.delete_event(&e).unwrap();
        assert!(r.list_events().unwrap().is_empty());
        let act = r.get_activity(&a).unwrap();
        assert_eq!((act.event_id.as_str(), act.event.as_str()), ("", ""), "the activity stays, out of the event");
        assert!(r.set_activity_event("missing", None).is_err());
    }

    #[test]
    fn event_names_already_typed_become_events() {
        let r = repo();
        let a = r.create_activity("Ham net", "directed_net", None, None).unwrap();
        let b = r.create_activity("GMRS net", "directed_net", None, None).unwrap();
        for id in [&a, &b] {
            r.conn.execute("UPDATE activities SET event = 'SET', event_id = NULL WHERE id = ?1", params![id]).unwrap();
        }
        r.conn.execute("DELETE FROM events", []).unwrap();
        let sql = include_str!("../migrations/0031_events.sql");
        r.conn.execute_batch(&sql[sql.find("INSERT INTO events").unwrap()..]).unwrap();
        let events = r.list_events().unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(r.get_activity(&b).unwrap().event_id, events[0].id);
    }
}
