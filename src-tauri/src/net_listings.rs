//! Net listings (docs/features/net-listings.md): the nets in the area — which
//! repeater, which days, what time, who runs it. Reference data only: when a
//! net next meets is worked out from its schedule in the interface, and
//! nothing is stored per meeting.

use crate::repo::Repository;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A listing as stored and listed.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct NetListing {
    pub id: String,
    #[serde(flatten)]
    pub details: NetListingDetails,
    /// When it was retired, or empty while in use.
    pub retired_at: String,
}

/// What the operator enters for a listing.
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Default)]
pub struct NetListingDetails {
    pub name: String,
    pub activity_type: String,
    /// A repeater from the directory, or None for free-text frequency.
    pub repeater_id: Option<String>,
    pub frequency: String,
    /// "weekly", "monthly" or "as_needed".
    pub schedule_kind: String,
    /// 0 = Sunday … 6 = Saturday.
    pub weekdays: Vec<u8>,
    /// Monthly only: "1"–"4" or "last".
    pub weeks: Vec<String>,
    /// Local time, "HH:MM"; empty for "as needed".
    pub start_time: String,
    /// Optional; empty when not given.
    pub end_time: String,
    pub run_by: String,
    /// What to know before checking in (NETL-006).
    pub checkin_info: String,
    pub notes: String,
}

const WEEKS: [&str; 5] = ["1", "2", "3", "4", "last"];

/// "HH:MM" as minutes past midnight, if it is one.
fn minutes(t: &str) -> Option<u32> {
    let (h, m) = t.split_once(':')?;
    if h.len() != 2 || m.len() != 2 {
        return None;
    }
    let (h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
    (h < 24 && m < 60).then_some(h * 60 + m)
}

/// Checks and tidies what was entered (NETL-001–005).
pub fn clean(mut d: NetListingDetails) -> Result<NetListingDetails, String> {
    for text in [&mut d.name, &mut d.frequency, &mut d.run_by, &mut d.checkin_info, &mut d.notes, &mut d.start_time, &mut d.end_time] {
        *text = text.trim().to_string();
    }
    if d.name.is_empty() {
        return Err("A net listing needs a name.".into());
    }
    d.activity_type = Repository::clean_activity_type(&d.activity_type);
    d.repeater_id = d.repeater_id.filter(|id| !id.trim().is_empty());
    if d.repeater_id.is_some() {
        // The repeater's own frequency is shown; free text would only conflict.
        d.frequency.clear();
    }
    match d.schedule_kind.as_str() {
        "as_needed" => {
            d.weekdays.clear();
            d.weeks.clear();
            d.start_time.clear();
            d.end_time.clear();
            return Ok(d);
        }
        "weekly" => d.weeks.clear(),
        "monthly" => {
            if d.weeks.is_empty() {
                return Err("Choose which weeks of the month the net meets.".into());
            }
            if let Some(w) = d.weeks.iter().find(|w| !WEEKS.contains(&w.as_str())) {
                return Err(format!("\"{w}\" isn't a week of the month."));
            }
            d.weeks.sort_by_key(|w| WEEKS.iter().position(|x| x == w));
            d.weeks.dedup();
        }
        other => return Err(format!("\"{other}\" isn't a schedule. Use weekly, monthly or as needed.")),
    }
    if d.weekdays.is_empty() {
        return Err("Choose the day or days the net meets.".into());
    }
    if d.weekdays.iter().any(|&w| w > 6) {
        return Err("Weekdays run from 0 (Sunday) to 6 (Saturday).".into());
    }
    d.weekdays.sort_unstable();
    d.weekdays.dedup();
    let Some(start) = minutes(&d.start_time) else {
        return Err("Enter the start time as HH:MM, for example 19:00.".into());
    };
    if !d.end_time.is_empty() {
        let Some(end) = minutes(&d.end_time) else {
            return Err("Enter the end time as HH:MM, or leave it blank.".into());
        };
        if end <= start {
            return Err("The end time should be after the start time.".into());
        }
    }
    Ok(d)
}

fn join<T: ToString>(v: &[T]) -> Option<String> {
    (!v.is_empty()).then(|| v.iter().map(T::to_string).collect::<Vec<_>>().join(","))
}

fn blank(s: &str) -> Option<&str> {
    if s.is_empty() { None } else { Some(s) }
}

const COLS: &str = "id, name, activity_type, repeater_id, coalesce(frequency,''), schedule_kind, coalesce(weekdays,''), coalesce(weeks,''), coalesce(start_time,''), coalesce(end_time,''), coalesce(run_by,''), coalesce(notes,''), coalesce(retired_at,''), coalesce(checkin_info,'')";

fn map(r: &rusqlite::Row) -> rusqlite::Result<NetListing> {
    let weekdays: String = r.get(6)?;
    let weeks: String = r.get(7)?;
    Ok(NetListing {
        id: r.get(0)?,
        details: NetListingDetails {
            name: r.get(1)?,
            activity_type: r.get(2)?,
            repeater_id: r.get(3)?,
            frequency: r.get(4)?,
            schedule_kind: r.get(5)?,
            weekdays: weekdays.split(',').filter_map(|w| w.parse().ok()).collect(),
            weeks: weeks.split(',').filter(|w| !w.is_empty()).map(String::from).collect(),
            start_time: r.get(8)?,
            end_time: r.get(9)?,
            run_by: r.get(10)?,
            checkin_info: r.get(13)?,
            notes: r.get(11)?,
        },
        retired_at: r.get(12)?,
    })
}

impl Repository {
    /// In-use (or, with `retired`, retired) listings by name. When each next
    /// meets is worked out in the interface (NETL-020).
    pub fn list_net_listings(&self, retired: bool) -> rusqlite::Result<Vec<NetListing>> {
        let filter = if retired { "IS NOT NULL" } else { "IS NULL" };
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {COLS} FROM net_listings WHERE retired_at {filter} ORDER BY name COLLATE NOCASE"
        ))?;
        let rows = stmt.query_map([], map)?;
        rows.collect()
    }

    pub fn get_net_listing(&self, id: &str) -> rusqlite::Result<NetListing> {
        self.conn
            .query_row(&format!("SELECT {COLS} FROM net_listings WHERE id = ?1"), params![id], map)
    }

    /// Whether a repeater exists (retired or not), for checking a listing's.
    pub fn repeater_exists(&self, id: &str) -> rusqlite::Result<bool> {
        Ok(self
            .conn
            .query_row("SELECT 1 FROM repeaters WHERE id = ?1", params![id], |_| Ok(()))
            .optional()?
            .is_some())
    }

    /// Adds a listing (already checked with `clean`).
    pub fn create_net_listing(&self, d: &NetListingDetails) -> rusqlite::Result<String> {
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO net_listings(id, name, activity_type, repeater_id, frequency, schedule_kind, weekdays, weeks, start_time, end_time, run_by, notes, created_at, checkin_info) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![id, d.name, d.activity_type, d.repeater_id, blank(&d.frequency), d.schedule_kind, join(&d.weekdays), join(&d.weeks), blank(&d.start_time), blank(&d.end_time), blank(&d.run_by), blank(&d.notes), Utc::now().to_rfc3339(), blank(&d.checkin_info)],
        )?;
        Ok(id)
    }

    /// Replaces a listing's details (already checked with `clean`). Activities
    /// started from it keep their own copies (NETL-011).
    pub fn update_net_listing(&self, id: &str, d: &NetListingDetails) -> rusqlite::Result<()> {
        let n = self.conn.execute(
            "UPDATE net_listings SET name = ?1, activity_type = ?2, repeater_id = ?3, frequency = ?4, schedule_kind = ?5, weekdays = ?6, weeks = ?7, start_time = ?8, end_time = ?9, run_by = ?10, notes = ?11, checkin_info = ?12 WHERE id = ?13",
            params![d.name, d.activity_type, d.repeater_id, blank(&d.frequency), d.schedule_kind, join(&d.weekdays), join(&d.weeks), blank(&d.start_time), blank(&d.end_time), blank(&d.run_by), blank(&d.notes), blank(&d.checkin_info), id],
        )?;
        if n == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    /// Hides (or, with `retired` false, restores) a listing (NETL-010).
    pub fn set_net_listing_retired(&self, id: &str, retired: bool) -> rusqlite::Result<()> {
        let at = retired.then(|| Utc::now().to_rfc3339());
        self.conn
            .execute("UPDATE net_listings SET retired_at = ?1 WHERE id = ?2", params![at, id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> Repository {
        let path = std::env::temp_dir().join(format!("roc-netl-{}.db", Uuid::new_v4()));
        Repository::new(crate::db::open_db(&path).unwrap())
    }

    fn tuesday_net() -> NetListingDetails {
        NetListingDetails {
            name: " Tuesday Night Net ".into(),
            activity_type: "directed_net".into(),
            frequency: "146.520".into(),
            schedule_kind: "weekly".into(),
            weekdays: vec![2],
            start_time: "19:00".into(),
            end_time: "19:30".into(),
            checkin_info: " Call sign and name, mobiles first ".into(),
            ..Default::default()
        }
    }

    #[test]
    fn entries_are_checked_and_tidied() {
        // NETL-001, NETL-003, NETL-004
        let d = clean(tuesday_net()).unwrap();
        assert_eq!(d.name, "Tuesday Night Net");
        assert_eq!(d.checkin_info, "Call sign and name, mobiles first");

        let bad = |f: fn(&mut NetListingDetails)| {
            let mut d = tuesday_net();
            f(&mut d);
            clean(d).unwrap_err()
        };
        assert!(bad(|d| d.name = " ".into()).contains("name"));
        assert!(bad(|d| d.weekdays.clear()).contains("day"));
        assert!(bad(|d| d.weekdays = vec![7]).contains("Weekdays"));
        assert!(bad(|d| d.start_time = "7pm".into()).contains("HH:MM"));
        assert!(bad(|d| d.start_time = "24:00".into()).contains("HH:MM"));
        assert!(bad(|d| d.end_time = "18:00".into()).contains("after"));
        assert!(bad(|d| d.schedule_kind = "daily".into()).contains("schedule"));
        assert!(bad(|d| d.schedule_kind = "monthly".into()).contains("weeks"));
        assert!(bad(|d| {
            d.schedule_kind = "monthly".into();
            d.weeks = vec!["5".into()];
        })
        .contains("week of the month"));

        // As needed: no days or times.
        let mut asn = tuesday_net();
        asn.schedule_kind = "as_needed".into();
        let asn = clean(asn).unwrap();
        assert!(asn.weekdays.is_empty() && asn.start_time.is_empty() && asn.end_time.is_empty());

        // Weeks are put in order; a repeater replaces free-text frequency.
        let mut monthly = tuesday_net();
        monthly.schedule_kind = "monthly".into();
        monthly.weeks = vec!["last".into(), "2".into(), "2".into()];
        monthly.repeater_id = Some("r1".into());
        let monthly = clean(monthly).unwrap();
        assert_eq!(monthly.weeks, ["2", "last"]);
        assert_eq!(monthly.frequency, "");
    }

    #[test]
    fn listings_are_stored_edited_and_retired() {
        // NETL-010
        let r = repo();
        let mut d = clean(tuesday_net()).unwrap();
        d.weekdays = vec![1, 3, 5];
        let id = r.create_net_listing(&d).unwrap();
        let got = r.get_net_listing(&id).unwrap();
        assert_eq!(got.details, d);

        let mut changed = d.clone();
        changed.schedule_kind = "monthly".into();
        changed.weeks = vec!["1".into(), "last".into()];
        r.update_net_listing(&id, &changed).unwrap();
        assert_eq!(r.get_net_listing(&id).unwrap().details.weeks, ["1", "last"]);
        assert!(r.update_net_listing("missing", &changed).is_err());

        r.set_net_listing_retired(&id, true).unwrap();
        assert!(r.list_net_listings(false).unwrap().is_empty());
        assert_eq!(r.list_net_listings(true).unwrap().len(), 1);
        r.set_net_listing_retired(&id, false).unwrap();
        assert_eq!(r.list_net_listings(false).unwrap().len(), 1);
    }
}
