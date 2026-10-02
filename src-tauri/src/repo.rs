use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub struct Repository {
    pub conn: Connection,
}

#[derive(Serialize, Debug, Clone)]
pub struct Operator {
    pub id: String,
    pub display_name: String,
    pub call_sign: String,
    pub location_label: String,
    pub location_lat: Option<f64>,
    pub location_lon: Option<f64>,
}

#[derive(Serialize, Debug, Clone)]
pub struct Activity {
    pub id: String,
    pub title: String,
    pub activity_type: String,
    pub scheduled_at: String,
    pub frequency: String,
    pub location_label: String,
    pub location_lat: Option<f64>,
    pub location_lon: Option<f64>,
    /// "scheduled", "active" or "closed" (see `transition_activity`).
    pub state: String,
    /// When the activity was started / closed (UTC, RFC 3339), or empty.
    pub opened_at: String,
    pub closed_at: String,
    /// The operator's closing notes, or empty.
    pub conclusion: String,
    /// The repeater it runs on, copied from the directory or set by hand;
    /// apart from `location`, which is where net control is (RPT-021).
    pub repeater_name: String,
    pub repeater_lat: Option<f64>,
    pub repeater_lon: Option<f64>,
}

/// Counts and times for one activity, shown when wrapping up a net and on the
/// activity's summary.
#[derive(Serialize, Debug, Clone)]
pub struct ActivitySummary {
    pub state: String,
    pub opened_at: String,
    pub closed_at: String,
    pub conclusion: String,
    pub checkins: i64,
    pub unique_stations: i64,
    pub removed_checkins: i64,
    pub first_checkin_at: String,
    pub last_checkin_at: String,
    pub spotter_reports: i64,
    /// Spotter reports by hazard type, most numerous first.
    pub hazards: Vec<HazardCount>,
    pub traffic_items: i64,
    /// Traffic items not yet marked as handled ("none").
    pub open_traffic_items: i64,
}

#[derive(Serialize, Debug, Clone)]
pub struct HazardCount {
    pub hazard_type: String,
    pub count: i64,
}

/// A reusable starting point for a new activity: the parts that stay the same
/// from one occurrence to the next. The date is never stored — each new
/// activity takes the day it's created on.
#[derive(Serialize, Debug, Clone)]
pub struct ActivityTemplate {
    pub id: String,
    pub name: String,
    pub title: String,
    /// The kind of activity it starts (see `Repository::clean_activity_type`).
    pub activity_type: String,
    /// "HH:MM", or empty.
    pub scheduled_time: String,
    pub frequency: String,
    pub location_label: String,
    pub location_lat: Option<f64>,
    pub location_lon: Option<f64>,
}

#[derive(Serialize, Debug, Clone)]
pub struct Checkin {
    pub id: String,
    pub call_sign: String,
    pub name: String,
    pub qth_location: String,
    pub grid_square: String,
    pub address: String,
    pub checked_in_at: String,
    pub location_lat: Option<f64>,
    pub location_lon: Option<f64>,
    pub location_label: String,
    /// The station has traffic to pass; `traffic` holds the details, if any yet.
    pub has_traffic: bool,
    pub traffic: String,
    pub traffic_handled: bool,
    /// Radio details of a contact (station logs); empty when not recorded.
    pub frequency: String,
    pub mode: String,
    pub rst_sent: String,
    pub rst_received: String,
    pub power: String,
    pub antenna: String,
    pub notes: String,
    /// Range checks: "mobile", "base" or "ht", and the cross street given.
    pub station_kind: String,
    pub cross_street: String,
}

/// The radio details of a contact, as entered. Every field is optional.
#[derive(Deserialize, Serialize, Debug, Clone, Default, PartialEq)]
pub struct ContactDetails {
    /// When the contact was made (RFC 3339). None means "now" on create and
    /// "unchanged" on update.
    pub contacted_at: Option<String>,
    pub frequency: Option<String>,
    pub mode: Option<String>,
    pub rst_sent: Option<String>,
    pub rst_received: Option<String>,
    pub power: Option<String>,
    pub antenna: Option<String>,
    pub notes: Option<String>,
    /// Range checks (see `range_check.rs`).
    pub station_kind: Option<String>,
    pub cross_street: Option<String>,
}

impl ContactDetails {
    /// Blank fields are stored as nothing, not as empty text.
    pub(crate) fn field(v: &Option<String>) -> Option<&str> {
        v.as_deref().map(str::trim).filter(|t| !t.is_empty())
    }
}

/// What's known about a call sign from earlier records, across every
/// activity: the "worked before" line.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct StationHistory {
    /// Earlier contacts/check-ins with this call sign (not counting removed ones).
    pub count: u32,
    /// The most recent one, if any.
    pub last: Option<PastContact>,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct PastContact {
    pub activity_id: String,
    pub activity_title: String,
    pub at: String,
    /// The most recent name and QTH on record for the call, even when the
    /// latest contact left them blank.
    pub name: String,
    pub qth_location: String,
    /// The contact's own frequency, else its activity's.
    pub frequency: String,
}

/// Columns `map_checkin` reads, in order.
const CHECKIN_COLUMNS: &str = "id, call_sign, coalesce(name,''), coalesce(qth_location,''), coalesce(grid_square,''), coalesce(address,''), checked_in_at, location_lat, location_lon, coalesce(location_label,''), has_traffic, coalesce(traffic,''), traffic_handled, coalesce(frequency,''), coalesce(mode,''), coalesce(rst_sent,''), coalesce(rst_received,''), coalesce(power,''), coalesce(antenna,''), coalesce(notes,''), coalesce(station_kind,''), coalesce(cross_street,'')";

#[derive(Serialize, Debug, Clone)]
pub struct SpotterReport {
    pub id: String,
    pub activity_id: String,
    pub operator_id: String,
    pub reported_at: String,
    pub county: String,
    pub location_text: String,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub reporter: String,
    pub hazard_type: String,
    pub magnitude: String,
    pub source: String,
    pub notes: String,
    pub checkin_id: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct AuditEvent {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub action: String,
    pub data: String,
    pub created_at: String,
}

/// One line of an activity's history: what happened, to what, by whom, and when.
#[derive(Serialize, Debug, Clone)]
pub struct HistoryEvent {
    pub id: String,
    /// "activity", "checkin" or "spotter_report".
    pub entity_type: String,
    pub entity_id: String,
    pub action: String,
    pub data: String,
    /// The operator who did it (display name and call sign), or empty.
    pub operator: String,
    pub created_at: String,
}

/// How many records an activity holds, or held before it was deleted.
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct DeletedCounts {
    pub checkins: u32,
    pub spotter_reports: u32,
}

impl Repository {
    pub fn new(conn: Connection) -> Self {
        Self { conn }
    }

    pub fn create_operator(
        &self,
        display_name: &str,
        call_sign: Option<&str>,
    ) -> rusqlite::Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO operators(id, display_name, call_sign, created_at) VALUES (?1,?2,?3,?4)",
            params![id, display_name, call_sign, now],
        )?;
        Ok(id)
    }

    pub fn list_operators(&self) -> rusqlite::Result<Vec<Operator>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, display_name, coalesce(call_sign,''), coalesce(location_label,''), location_lat, location_lon FROM operators WHERE retired_at IS NULL ORDER BY display_name",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Operator {
                id: r.get(0)?,
                display_name: r.get(1)?,
                call_sign: r.get(2)?,
                location_label: r.get(3)?,
                location_lat: r.get(4)?,
                location_lon: r.get(5)?,
            })
        })?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        Ok(v)
    }

    pub fn get_operator(&self, id: &str) -> rusqlite::Result<Operator> {
        self.conn.query_row(
            "SELECT id, display_name, coalesce(call_sign,''), coalesce(location_label,''), location_lat, location_lon FROM operators WHERE id = ?1",
            params![id],
            |r| {
                Ok(Operator {
                    id: r.get(0)?,
                    display_name: r.get(1)?,
                    call_sign: r.get(2)?,
                    location_label: r.get(3)?,
                    location_lat: r.get(4)?,
                    location_lon: r.get(5)?,
                })
            },
        )
    }

    pub fn set_operator_location(
        &self,
        id: &str,
        location_label: Option<&str>,
        location_lat: Option<f64>,
        location_lon: Option<f64>,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE operators SET location_label = ?1, location_lat = ?2, location_lon = ?3 WHERE id = ?4",
            params![location_label, location_lat, location_lon, id],
        )?;
        Ok(())
    }

    /// Retired operators: hidden from lists and pickers, kept for history (AUDIT-013).
    pub fn list_retired_operators(&self) -> rusqlite::Result<Vec<Operator>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, display_name, coalesce(call_sign,''), coalesce(location_label,''), location_lat, location_lon FROM operators WHERE retired_at IS NOT NULL ORDER BY display_name",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Operator {
                id: r.get(0)?,
                display_name: r.get(1)?,
                call_sign: r.get(2)?,
                location_label: r.get(3)?,
                location_lat: r.get(4)?,
                location_lon: r.get(5)?,
            })
        })?;
        rows.collect()
    }

    /// Whether anything names this operator: a check-in, a spotter report, or
    /// a history event (other than the operator's own retire/restore events).
    pub fn operator_has_records(&self, id: &str) -> rusqlite::Result<bool> {
        self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM checkins WHERE operator_id = ?1) \
                 OR EXISTS(SELECT 1 FROM spotter_reports WHERE operator_id = ?1) \
                 OR EXISTS(SELECT 1 FROM audit_events WHERE operator_id = ?1 \
                           AND NOT (entity_type = 'operator' AND entity_id = ?1))",
            params![id],
            |r| r.get(0),
        )
    }

    /// Permanently deletes an operator nothing names (AUDIT-012). One with
    /// records can only be retired (AUDIT-013), so this refuses.
    pub fn delete_operator(&self, id: &str) -> Result<(), String> {
        if self.operator_has_records(id).map_err(|e| e.to_string())? {
            return Err(
                "This operator has been recorded on check-ins, reports, or history, so they can only be retired.".into(),
            );
        }
        let tx = self.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM audit_events WHERE entity_type = 'operator' AND entity_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        let n = tx.execute("DELETE FROM operators WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("That operator no longer exists.".into());
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn retire_operator(&self, id: &str) -> rusqlite::Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute("UPDATE operators SET retired_at = ?1 WHERE id = ?2", params![now, id])?;
        Ok(())
    }

    pub fn restore_operator(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute("UPDATE operators SET retired_at = NULL WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn create_activity(
        &self,
        title: &str,
        activity_type: &str,
        scheduled_at: Option<&str>,
        frequency: Option<&str>,
    ) -> rusqlite::Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO activities(id, title, type, state, created_at, scheduled_at, frequency) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![id, title, Self::clean_activity_type(activity_type), "scheduled", now, scheduled_at, frequency],
        )?;
        Ok(id)
    }

    pub fn list_activity_templates(&self) -> rusqlite::Result<Vec<ActivityTemplate>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, title, coalesce(scheduled_time,''), coalesce(frequency,''), coalesce(location_label,''), location_lat, location_lon, activity_type FROM activity_templates ORDER BY name COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(ActivityTemplate {
                id: r.get(0)?,
                name: r.get(1)?,
                title: r.get(2)?,
                scheduled_time: r.get(3)?,
                frequency: r.get(4)?,
                location_label: r.get(5)?,
                location_lat: r.get(6)?,
                location_lon: r.get(7)?,
                activity_type: r.get(8)?,
            })
        })?;
        rows.collect()
    }

    /// Saves a template under `name`, replacing an existing one with the same
    /// name (case-insensitive) so re-saving updates it rather than piling up
    /// near-duplicates.
    #[allow(clippy::too_many_arguments)]
    pub fn save_activity_template(
        &self,
        name: &str,
        title: &str,
        activity_type: &str,
        scheduled_time: Option<&str>,
        frequency: Option<&str>,
        location_label: Option<&str>,
        location_lat: Option<f64>,
        location_lon: Option<f64>,
    ) -> rusqlite::Result<String> {
        let existing: Option<String> = self
            .conn
            .query_row(
                "SELECT id FROM activity_templates WHERE name = ?1 COLLATE NOCASE",
                params![name],
                |r| r.get(0),
            )
            .ok();
        match existing {
            Some(id) => {
                self.conn.execute(
                    "UPDATE activity_templates SET name = ?1, title = ?2, scheduled_time = ?3, frequency = ?4, location_label = ?5, location_lat = ?6, location_lon = ?7, activity_type = ?8 WHERE id = ?9",
                    params![name, title, scheduled_time, frequency, location_label, location_lat, location_lon, Self::clean_activity_type(activity_type), id],
                )?;
                Ok(id)
            }
            None => {
                let id = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();
                self.conn.execute(
                    "INSERT INTO activity_templates(id, name, title, scheduled_time, frequency, location_label, location_lat, location_lon, created_at, activity_type) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                    params![id, name, title, scheduled_time, frequency, location_label, location_lat, location_lon, now, Self::clean_activity_type(activity_type)],
                )?;
                Ok(id)
            }
        }
    }

    /// Rewrites one template by id (including renaming it). Fails with a
    /// readable message if the new name is already another template's.
    #[allow(clippy::too_many_arguments)]
    pub fn update_activity_template(
        &self,
        id: &str,
        name: &str,
        title: &str,
        activity_type: &str,
        scheduled_time: Option<&str>,
        frequency: Option<&str>,
        location_label: Option<&str>,
        location_lat: Option<f64>,
        location_lon: Option<f64>,
    ) -> Result<(), String> {
        let clash: Option<String> = self
            .conn
            .query_row(
                "SELECT id FROM activity_templates WHERE name = ?1 COLLATE NOCASE AND id != ?2",
                params![name, id],
                |r| r.get(0),
            )
            .ok();
        if clash.is_some() {
            return Err(format!("There's already a template named “{name}”."));
        }
        self.conn
            .execute(
                "UPDATE activity_templates SET name = ?1, title = ?2, scheduled_time = ?3, frequency = ?4, location_label = ?5, location_lat = ?6, location_lon = ?7, activity_type = ?8 WHERE id = ?9",
                params![name, title, scheduled_time, frequency, location_label, location_lat, location_lon, Self::clean_activity_type(activity_type), id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_activity_template(&self, id: &str) -> rusqlite::Result<()> {
        self.conn
            .execute("DELETE FROM activity_templates WHERE id = ?1", params![id])?;
        Ok(())
    }

    const ACTIVITY_COLS: &'static str = "id, title, type, coalesce(scheduled_at,''), coalesce(frequency,''), coalesce(location_label,''), location_lat, location_lon, state, coalesce(opened_at,''), coalesce(closed_at,''), coalesce(conclusion,''), coalesce(repeater_name,''), repeater_lat, repeater_lon";

    fn map_activity(r: &rusqlite::Row) -> rusqlite::Result<Activity> {
        Ok(Activity {
            id: r.get(0)?,
            title: r.get(1)?,
            activity_type: r.get(2)?,
            scheduled_at: r.get(3)?,
            frequency: r.get(4)?,
            location_label: r.get(5)?,
            location_lat: r.get(6)?,
            location_lon: r.get(7)?,
            state: r.get(8)?,
            opened_at: r.get(9)?,
            closed_at: r.get(10)?,
            conclusion: r.get(11)?,
            repeater_name: r.get(12)?,
            repeater_lat: r.get(13)?,
            repeater_lon: r.get(14)?,
        })
    }

    pub fn list_activities(&self) -> rusqlite::Result<Vec<Activity>> {
        let mut stmt = self.conn.prepare(&format!("SELECT {} FROM activities WHERE archived_at IS NULL ORDER BY scheduled_at DESC, created_at DESC", Self::ACTIVITY_COLS))?;
        let rows = stmt.query_map([], Self::map_activity)?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        Ok(v)
    }

    pub fn list_archived_activities(&self) -> rusqlite::Result<Vec<Activity>> {
        let mut stmt = self.conn.prepare(&format!("SELECT {} FROM activities WHERE archived_at IS NOT NULL ORDER BY archived_at DESC", Self::ACTIVITY_COLS))?;
        let rows = stmt.query_map([], Self::map_activity)?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        Ok(v)
    }

    pub fn get_activity(&self, id: &str) -> rusqlite::Result<Activity> {
        self.conn.query_row(
            &format!("SELECT {} FROM activities WHERE id = ?1", Self::ACTIVITY_COLS),
            params![id],
            Self::map_activity,
        )
    }

    pub fn set_activity_location(
        &self,
        id: &str,
        location_label: Option<&str>,
        location_lat: Option<f64>,
        location_lon: Option<f64>,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE activities SET location_label = ?1, location_lat = ?2, location_lon = ?3 WHERE id = ?4",
            params![location_label, location_lat, location_lon, id],
        )?;
        Ok(())
    }

    /// Activity types are just names stored on the activity; which ones exist,
    /// and what each shows, is defined in the front end (`activityTypes.ts`),
    /// so adding a type needs no database change. A blank type means "other".
    pub fn clean_activity_type(t: &str) -> String {
        let t = t.trim();
        if t.is_empty() { "other".to_string() } else { t.to_string() }
    }

    pub fn update_activity(
        &self,
        id: &str,
        title: &str,
        activity_type: &str,
        scheduled_at: Option<&str>,
        frequency: Option<&str>,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE activities SET title = ?1, type = ?2, scheduled_at = ?3, frequency = ?4 WHERE id = ?5",
            params![title, Self::clean_activity_type(activity_type), scheduled_at, frequency, id],
        )?;
        Ok(())
    }

    /// What deleting this activity would erase: all its check-ins (removed
    /// ones too) and spotter reports (AUDIT-008).
    pub fn activity_contents(&self, id: &str) -> rusqlite::Result<DeletedCounts> {
        self.conn.query_row(
            "SELECT (SELECT count(*) FROM checkins WHERE activity_id = ?1), \
                    (SELECT count(*) FROM spotter_reports WHERE activity_id = ?1)",
            params![id],
            |r| Ok(DeletedCounts { checkins: r.get(0)?, spotter_reports: r.get(1)? }),
        )
    }

    /// Permanently erases an activity with its check-ins, spotter reports, and
    /// all history on them (AUDIT-007), leaving one event that says it was
    /// deleted, by whom, with its title and counts only (AUDIT-010). The
    /// database runs with `secure_delete` on, and the WAL is checkpointed so
    /// the erased text isn't left in it either (AUDIT-009).
    pub fn delete_activity_permanently(
        &self,
        id: &str,
        operator_id: Option<&str>,
    ) -> Result<DeletedCounts, String> {
        let activity = self.get_activity(id).map_err(|_| "That activity no longer exists.".to_string())?;
        let counts = self.activity_contents(id).map_err(|e| e.to_string())?;
        let tx = self.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        for sql in [
            "DELETE FROM audit_events WHERE entity_id = ?1 \
                OR entity_id IN (SELECT id FROM checkins WHERE activity_id = ?1) \
                OR entity_id IN (SELECT id FROM spotter_reports WHERE activity_id = ?1)",
            "DELETE FROM spotter_reports WHERE activity_id = ?1",
            "DELETE FROM checkins WHERE activity_id = ?1",
            "DELETE FROM activities WHERE id = ?1",
        ] {
            tx.execute(sql, params![id]).map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        let data = serde_json::json!({
            "title": activity.title,
            "checkins": counts.checkins,
            "spotter_reports": counts.spotter_reports,
        })
        .to_string();
        self.create_audit_event("activity", id, "delete_permanently", Some(&data), operator_id)
            .map_err(|e| e.to_string())?;
        self.conn
            .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))
            .map_err(|e| e.to_string())?;
        Ok(counts)
    }

    pub fn archive_activity(&self, id: &str) -> rusqlite::Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE activities SET archived_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    }

    pub fn restore_activity(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE activities SET archived_at = NULL WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_checkin(
        &self,
        activity_id: &str,
        call_sign: &str,
        name: Option<&str>,
        qth_location: Option<&str>,
        grid_square: Option<&str>,
        address: Option<&str>,
        operator_id: Option<&str>,
        location_lat: Option<f64>,
        location_lon: Option<f64>,
        location_label: Option<&str>,
        has_traffic: bool,
        traffic: Option<&str>,
        contact: &ContactDetails,
    ) -> rusqlite::Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        // The contact's own time when given (logged after the fact); when it
        // was entered is always now.
        let at = ContactDetails::field(&contact.contacted_at).unwrap_or(&now);
        let f = ContactDetails::field;
        self.conn.execute(
            "INSERT INTO checkins(id, activity_id, call_sign, name, qth_location, grid_square, address, checked_in_at, entered_at, operator_id, location_lat, location_lon, location_label, has_traffic, traffic, frequency, mode, rst_sent, rst_received, power, antenna, notes, station_kind, cross_street) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24)",
            params![id, activity_id, call_sign, name, qth_location, grid_square, address, at, now, operator_id, location_lat, location_lon, location_label, has_traffic, if has_traffic { traffic } else { None },
                f(&contact.frequency), f(&contact.mode), f(&contact.rst_sent), f(&contact.rst_received), f(&contact.power), f(&contact.antenna), f(&contact.notes), f(&contact.station_kind), f(&contact.cross_street)],
        )?;
        Ok(id)
    }

    fn map_checkin(r: &rusqlite::Row) -> rusqlite::Result<Checkin> {
        Ok(Checkin {
            id: r.get(0)?,
            call_sign: r.get(1)?,
            name: r.get(2)?,
            qth_location: r.get(3)?,
            grid_square: r.get(4)?,
            address: r.get(5)?,
            checked_in_at: r.get(6)?,
            location_lat: r.get(7)?,
            location_lon: r.get(8)?,
            location_label: r.get(9)?,
            has_traffic: r.get(10)?,
            traffic: r.get(11)?,
            traffic_handled: r.get(12)?,
            frequency: r.get(13)?,
            mode: r.get(14)?,
            rst_sent: r.get(15)?,
            rst_received: r.get(16)?,
            power: r.get(17)?,
            antenna: r.get(18)?,
            notes: r.get(19)?,
            station_kind: r.get(20)?,
            cross_street: r.get(21)?,
        })
    }

    pub fn list_checkins(&self, activity_id: &str) -> rusqlite::Result<Vec<Checkin>> {
        let mut stmt = self.conn.prepare(&format!("SELECT {CHECKIN_COLUMNS} FROM checkins WHERE activity_id = ?1 AND voided_at IS NULL ORDER BY checked_in_at DESC"))?;
        let rows = stmt.query_map(params![activity_id], Self::map_checkin)?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        Ok(v)
    }

    pub fn list_voided_checkins(&self, activity_id: &str) -> rusqlite::Result<Vec<Checkin>> {
        let mut stmt = self.conn.prepare(&format!("SELECT {CHECKIN_COLUMNS} FROM checkins WHERE activity_id = ?1 AND voided_at IS NOT NULL ORDER BY voided_at DESC"))?;
        let rows = stmt.query_map(params![activity_id], Self::map_checkin)?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        Ok(v)
    }

    pub fn get_checkin(&self, id: &str) -> rusqlite::Result<Checkin> {
        self.conn.query_row(
            &format!("SELECT {CHECKIN_COLUMNS} FROM checkins WHERE id = ?1"),
            params![id],
            Self::map_checkin,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_checkin(
        &self,
        id: &str,
        call_sign: &str,
        name: Option<&str>,
        qth_location: Option<&str>,
        grid_square: Option<&str>,
        address: Option<&str>,
        location_lat: Option<f64>,
        location_lon: Option<f64>,
        location_label: Option<&str>,
        has_traffic: bool,
        traffic: Option<&str>,
        contact: Option<&ContactDetails>,
    ) -> rusqlite::Result<()> {
        // Clearing "has traffic" also clears its details and handled mark.
        self.conn.execute(
            "UPDATE checkins SET call_sign = ?1, name = ?2, qth_location = ?3, grid_square = ?4, address = ?5, location_lat = ?6, location_lon = ?7, location_label = ?8, has_traffic = ?9, traffic = ?10, traffic_handled = CASE WHEN ?9 THEN traffic_handled ELSE 0 END WHERE id = ?11",
            params![call_sign, name, qth_location, grid_square, address, location_lat, location_lon, location_label, has_traffic, if has_traffic { traffic } else { None }, id],
        )?;
        // No contact details given (e.g. a call-sign lookup filling in a
        // name) leaves them as they are; given, they replace what's there.
        if let Some(c) = contact {
            let f = ContactDetails::field;
            self.conn.execute(
                "UPDATE checkins SET frequency = ?1, mode = ?2, rst_sent = ?3, rst_received = ?4, power = ?5, antenna = ?6, notes = ?7, checked_in_at = coalesce(?8, checked_in_at), station_kind = ?9, cross_street = ?10 WHERE id = ?11",
                params![f(&c.frequency), f(&c.mode), f(&c.rst_sent), f(&c.rst_received), f(&c.power), f(&c.antenna), f(&c.notes), f(&c.contacted_at), f(&c.station_kind), f(&c.cross_street), id],
            )?;
        }
        Ok(())
    }

    /// Earlier records of a call sign across every activity, newest first
    /// (removed ones don't count). Case-insensitive.
    pub fn station_history(&self, call_sign: &str) -> rusqlite::Result<StationHistory> {
        let call = call_sign.trim();
        if call.is_empty() {
            return Ok(StationHistory { count: 0, last: None });
        }
        let mut stmt = self.conn.prepare(
            "SELECT c.activity_id, a.title, c.checked_in_at, coalesce(c.name,''), coalesce(c.qth_location,''), \
                    coalesce(nullif(c.frequency,''), a.frequency, '') \
             FROM checkins c JOIN activities a ON a.id = c.activity_id \
             WHERE UPPER(c.call_sign) = UPPER(?1) AND c.voided_at IS NULL \
             ORDER BY c.checked_in_at DESC",
        )?;
        let rows: Vec<PastContact> = stmt
            .query_map(params![call], |r| {
                Ok(PastContact {
                    activity_id: r.get(0)?,
                    activity_title: r.get(1)?,
                    at: r.get(2)?,
                    name: r.get(3)?,
                    qth_location: r.get(4)?,
                    frequency: r.get(5)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        let count = rows.len() as u32;
        let last = rows.first().cloned().map(|mut last| {
            let latest = |get: fn(&PastContact) -> &str| {
                rows.iter().map(get).find(|v| !v.trim().is_empty()).unwrap_or("").to_string()
            };
            last.name = latest(|p| &p.name);
            last.qth_location = latest(|p| &p.qth_location);
            last
        });
        Ok(StationHistory { count, last })
    }

    pub fn set_checkin_traffic_handled(&self, id: &str, handled: bool) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE checkins SET traffic_handled = ?1 WHERE id = ?2 AND has_traffic = 1",
            params![handled, id],
        )?;
        Ok(())
    }

    /// Sets a check-in's location directly from known coordinates — a map
    /// click or manually typed GPS coordinates — overriding whatever was
    /// auto-resolved from its qth_location/grid_square/address at save time.
    /// Mirrors `set_operator_location`/`set_activity_location`'s
    /// coords-only path (CIMAP-073).
    pub fn set_checkin_location_coords(
        &self,
        id: &str,
        lat: f64,
        lon: f64,
        label: Option<&str>,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE checkins SET location_lat = ?1, location_lon = ?2, location_label = ?3 WHERE id = ?4",
            params![lat, lon, label, id],
        )?;
        Ok(())
    }

    pub fn clear_checkin_location(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE checkins SET location_lat = NULL, location_lon = NULL, location_label = NULL WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn void_checkin(&self, id: &str, reason: Option<&str>) -> rusqlite::Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE checkins SET voided_at = ?1, void_reason = ?2 WHERE id = ?3",
            params![now, reason, id],
        )?;
        Ok(())
    }

    pub fn restore_checkin(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE checkins SET voided_at = NULL, void_reason = NULL WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    #[allow(clippy::too_many_arguments)]
    pub fn create_spotter_report(
        &self,
        activity_id: &str,
        reported_at: &str,
        county: Option<&str>,
        location_text: Option<&str>,
        lat: Option<f64>,
        lon: Option<f64>,
        reporter: Option<&str>,
        hazard_type: &str,
        magnitude: Option<&str>,
        source: Option<&str>,
        notes: Option<&str>,
        checkin_id: Option<&str>,
        operator_id: Option<&str>,
    ) -> rusqlite::Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO spotter_reports(id, activity_id, operator_id, reported_at, county, location_text, lat, lon, reporter, hazard_type, magnitude, source, notes, checkin_id, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            params![id, activity_id, operator_id, reported_at, county, location_text, lat, lon, reporter, hazard_type, magnitude, source, notes, checkin_id, now],
        )?;
        Ok(id)
    }

    pub fn list_spotter_reports(&self, activity_id: &str) -> rusqlite::Result<Vec<SpotterReport>> {
        let mut stmt = self.conn.prepare("SELECT id, activity_id, coalesce(operator_id,''), reported_at, coalesce(county,''), coalesce(location_text,''), lat, lon, coalesce(reporter,''), hazard_type, coalesce(magnitude,''), coalesce(source,''), coalesce(notes,''), checkin_id FROM spotter_reports WHERE activity_id = ?1 AND voided_at IS NULL ORDER BY reported_at DESC")?;
        let rows = stmt.query_map(params![activity_id], Self::map_spotter_report)?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        Ok(v)
    }

    pub fn list_voided_spotter_reports(
        &self,
        activity_id: &str,
    ) -> rusqlite::Result<Vec<SpotterReport>> {
        let mut stmt = self.conn.prepare("SELECT id, activity_id, coalesce(operator_id,''), reported_at, coalesce(county,''), coalesce(location_text,''), lat, lon, coalesce(reporter,''), hazard_type, coalesce(magnitude,''), coalesce(source,''), coalesce(notes,''), checkin_id FROM spotter_reports WHERE activity_id = ?1 AND voided_at IS NOT NULL ORDER BY voided_at DESC")?;
        let rows = stmt.query_map(params![activity_id], Self::map_spotter_report)?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        Ok(v)
    }

    pub fn get_spotter_report(&self, id: &str) -> rusqlite::Result<SpotterReport> {
        self.conn.query_row(
            "SELECT id, activity_id, coalesce(operator_id,''), reported_at, coalesce(county,''), coalesce(location_text,''), lat, lon, coalesce(reporter,''), hazard_type, coalesce(magnitude,''), coalesce(source,''), coalesce(notes,''), checkin_id FROM spotter_reports WHERE id = ?1",
            params![id],
            Self::map_spotter_report,
        )
    }

    fn map_spotter_report(r: &rusqlite::Row) -> rusqlite::Result<SpotterReport> {
        Ok(SpotterReport {
            id: r.get(0)?,
            activity_id: r.get(1)?,
            operator_id: r.get(2)?,
            reported_at: r.get(3)?,
            county: r.get(4)?,
            location_text: r.get(5)?,
            lat: r.get(6)?,
            lon: r.get(7)?,
            reporter: r.get(8)?,
            hazard_type: r.get(9)?,
            magnitude: r.get(10)?,
            source: r.get(11)?,
            notes: r.get(12)?,
            checkin_id: r.get(13)?,
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_spotter_report(
        &self,
        id: &str,
        reported_at: &str,
        county: Option<&str>,
        location_text: Option<&str>,
        lat: Option<f64>,
        lon: Option<f64>,
        reporter: Option<&str>,
        hazard_type: &str,
        magnitude: Option<&str>,
        source: Option<&str>,
        notes: Option<&str>,
        checkin_id: Option<&str>,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE spotter_reports SET reported_at = ?1, county = ?2, location_text = ?3, lat = ?4, lon = ?5, reporter = ?6, hazard_type = ?7, magnitude = ?8, source = ?9, notes = ?10, checkin_id = ?11 WHERE id = ?12",
            params![reported_at, county, location_text, lat, lon, reporter, hazard_type, magnitude, source, notes, checkin_id, id],
        )?;
        Ok(())
    }

    pub fn void_spotter_report(&self, id: &str, reason: Option<&str>) -> rusqlite::Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE spotter_reports SET voided_at = ?1, void_reason = ?2 WHERE id = ?3",
            params![now, reason, id],
        )?;
        Ok(())
    }

    pub fn restore_spotter_report(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE spotter_reports SET voided_at = NULL, void_reason = NULL WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    /// True when the activity has been closed (and not reopened): ordinary
    /// records can't be added to or changed on it.
    pub fn is_activity_closed(&self, activity_id: &str) -> bool {
        self.conn
            .query_row(
                "SELECT state FROM activities WHERE id = ?1",
                params![activity_id],
                |r| r.get::<_, String>(0),
            )
            .map(|s| s == "closed")
            .unwrap_or(false)
    }

    pub fn activity_id_of_checkin(&self, checkin_id: &str) -> Option<String> {
        self.conn
            .query_row("SELECT activity_id FROM checkins WHERE id = ?1", params![checkin_id], |r| r.get(0))
            .ok()
    }

    pub fn activity_id_of_spotter_report(&self, report_id: &str) -> Option<String> {
        self.conn
            .query_row("SELECT activity_id FROM spotter_reports WHERE id = ?1", params![report_id], |r| r.get(0))
            .ok()
    }

    /// Moves an activity along its lifecycle: scheduled -> active -> closed,
    /// and closed -> active (reopening, which needs a reason). Anything else
    /// is refused. Each move is recorded as an audit event holding the prior
    /// and new state, the reason, and the time both as UTC and as the local
    /// clock reads (EVENT-001, EVENT-002, EVENT-004).
    pub fn transition_activity(
        &self,
        id: &str,
        to: &str,
        reason: Option<&str>,
        conclusion: Option<&str>,
        operator_id: Option<&str>,
    ) -> Result<(), String> {
        let from: String = self
            .conn
            .query_row("SELECT state FROM activities WHERE id = ?1", params![id], |r| r.get(0))
            .map_err(|_| "That activity no longer exists.".to_string())?;
        let reason = reason.map(str::trim).filter(|s| !s.is_empty());
        match (from.as_str(), to) {
            ("scheduled", "active") | ("active", "closed") => {}
            ("closed", "active") => {
                if reason.is_none() {
                    return Err("Say why you're reopening this activity.".into());
                }
            }
            (f, t) => return Err(format!("An activity can't go from {f} to {t}.")),
        }

        let now = Utc::now();
        let stamp = now.to_rfc3339();
        match (from.as_str(), to) {
            ("scheduled", "active") => self.conn.execute(
                "UPDATE activities SET state = 'active', opened_at = coalesce(opened_at, ?1) WHERE id = ?2",
                params![stamp, id],
            ),
            ("active", "closed") => self.conn.execute(
                "UPDATE activities SET state = 'closed', closed_at = ?1, conclusion = ?2 WHERE id = ?3",
                params![stamp, conclusion.map(str::trim).filter(|s| !s.is_empty()), id],
            ),
            // Reopening: the earlier close stays in the audit trail.
            _ => self.conn.execute(
                "UPDATE activities SET state = 'active', closed_at = NULL WHERE id = ?1",
                params![id],
            ),
        }
        .map_err(|e| e.to_string())?;

        let action = match (from.as_str(), to) {
            ("scheduled", "active") => "started",
            ("active", "closed") => "closed",
            _ => "reopened",
        };
        let data = serde_json::json!({
            "from": from,
            "to": to,
            "reason": reason,
            "utc_time": stamp,
            "local_time": chrono::Local::now().format("%Y-%m-%d %H:%M:%S %:z").to_string(),
        })
        .to_string();
        self.create_audit_event("activity", id, action, Some(&data), operator_id)
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn activity_summary(&self, id: &str) -> rusqlite::Result<ActivitySummary> {
        let a = self.get_activity(id)?;
        let one = |sql: &str| -> i64 {
            self.conn.query_row(sql, params![id], |r| r.get(0)).unwrap_or(0)
        };
        let (first, last): (Option<String>, Option<String>) = self
            .conn
            .query_row(
                "SELECT MIN(checked_in_at), MAX(checked_in_at) FROM checkins WHERE activity_id = ?1 AND voided_at IS NULL",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap_or((None, None));

        let hazards: Vec<HazardCount> = self
            .conn
            .prepare("SELECT hazard_type, COUNT(*) FROM spotter_reports WHERE activity_id = ?1 AND voided_at IS NULL GROUP BY hazard_type ORDER BY COUNT(*) DESC, hazard_type")
            .and_then(|mut st| {
                st.query_map(params![id], |r| Ok(HazardCount { hazard_type: r.get(0)?, count: r.get(1)? }))?
                    .collect()
            })
            .unwrap_or_default();
        Ok(ActivitySummary {
            state: a.state,
            opened_at: a.opened_at,
            closed_at: a.closed_at,
            conclusion: a.conclusion,
            checkins: one("SELECT COUNT(*) FROM checkins WHERE activity_id = ?1 AND voided_at IS NULL"),
            unique_stations: one("SELECT COUNT(DISTINCT UPPER(call_sign)) FROM checkins WHERE activity_id = ?1 AND voided_at IS NULL"),
            removed_checkins: one("SELECT COUNT(*) FROM checkins WHERE activity_id = ?1 AND voided_at IS NOT NULL"),
            first_checkin_at: first.unwrap_or_default(),
            last_checkin_at: last.unwrap_or_default(),
            hazards,
            spotter_reports: one("SELECT COUNT(*) FROM spotter_reports WHERE activity_id = ?1 AND voided_at IS NULL"),
            traffic_items: one("SELECT COUNT(*) FROM checkins WHERE activity_id = ?1 AND voided_at IS NULL AND has_traffic = 1"),
            open_traffic_items: one("SELECT COUNT(*) FROM checkins WHERE activity_id = ?1 AND voided_at IS NULL AND has_traffic = 1 AND traffic_handled = 0"),
        })
    }

    pub fn create_audit_event(
        &self,
        entity_type: &str,
        entity_id: &str,
        action: &str,
        data: Option<&str>,
        operator_id: Option<&str>,
    ) -> rusqlite::Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO audit_events(id, entity_type, entity_id, action, data, operator_id, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![id, entity_type, entity_id, action, data, operator_id, now],
        )?;
        Ok(id)
    }

    pub fn list_audit_events(&self, entity_id: &str) -> rusqlite::Result<Vec<AuditEvent>> {
        let mut stmt = self.conn.prepare("SELECT id, entity_type, entity_id, action, coalesce(data,''), created_at FROM audit_events WHERE entity_id = ?1 ORDER BY created_at DESC")?;
        let rows = stmt.query_map(params![entity_id], |r| {
            Ok(AuditEvent {
                id: r.get(0)?,
                entity_type: r.get(1)?,
                entity_id: r.get(2)?,
                action: r.get(3)?,
                data: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        Ok(v)
    }

    /// Everything recorded about one activity, oldest first: events on the
    /// activity itself (started, closed, corrections, log entries) and on its
    /// check-ins and spotter reports (corrections, removals, restores, traffic
    /// handled), each with the operator who made it.
    pub fn activity_history(&self, activity_id: &str) -> rusqlite::Result<Vec<HistoryEvent>> {
        let mut stmt = self.conn.prepare(
            "SELECT e.id, e.entity_type, e.entity_id, e.action, coalesce(e.data,''), \
                    coalesce(o.display_name || CASE WHEN coalesce(o.call_sign,'') != '' THEN ' (' || o.call_sign || ')' ELSE '' END, ''), \
                    e.created_at \
             FROM audit_events e LEFT JOIN operators o ON o.id = e.operator_id \
             WHERE e.entity_id = ?1 \
                OR e.entity_id IN (SELECT id FROM checkins WHERE activity_id = ?1) \
                OR e.entity_id IN (SELECT id FROM spotter_reports WHERE activity_id = ?1) \
             ORDER BY e.created_at, e.rowid",
        )?;
        let rows = stmt.query_map(params![activity_id], |r| {
            Ok(HistoryEvent {
                id: r.get(0)?,
                entity_type: r.get(1)?,
                entity_id: r.get(2)?,
                action: r.get(3)?,
                data: r.get(4)?,
                operator: r.get(5)?,
                created_at: r.get(6)?,
            })
        })?;
        rows.collect()
    }

    pub fn list_recent_audit_events(&self, limit: i64) -> rusqlite::Result<Vec<AuditEvent>> {
        let mut stmt = self.conn.prepare("SELECT id, entity_type, entity_id, action, coalesce(data,''), created_at FROM audit_events ORDER BY created_at DESC LIMIT ?1")?;
        let rows = stmt.query_map(params![limit], |r| {
            Ok(AuditEvent {
                id: r.get(0)?,
                entity_type: r.get(1)?,
                entity_id: r.get(2)?,
                action: r.get(3)?,
                data: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        Ok(v)
    }
}

#[cfg(test)]
mod template_tests {
    use super::*;

    fn repo() -> Repository {
        let path = std::env::temp_dir().join(format!("roc-tpl-{}.db", Uuid::new_v4()));
        Repository { conn: crate::db::open_db(&path).unwrap() }
    }

    #[test]
    fn templates_save_list_update_and_delete() {
        let r = repo();
        assert!(r.list_activity_templates().unwrap().is_empty());

        let id = r
            .save_activity_template("Weekly Net", "Tuesday Night Net", "directed_net", Some("19:00"), Some("146.940"), Some("EOC"), Some(28.5), Some(-81.4))
            .unwrap();
        let all = r.list_activity_templates().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].title, "Tuesday Night Net");
        assert_eq!(all[0].scheduled_time, "19:00");
        assert_eq!(all[0].location_lat, Some(28.5));

        // Same name, different case: updates in place.
        let again = r
            .save_activity_template("weekly net", "Tuesday Net", "skywarn", None, None, None, None, None)
            .unwrap();
        assert_eq!(again, id);
        let all = r.list_activity_templates().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].title, "Tuesday Net");
        assert_eq!(all[0].activity_type, "skywarn");
        assert_eq!(all[0].scheduled_time, "");
        assert_eq!(all[0].location_lat, None);

        // Editing by id can rename, but not onto another template's name.
        let other = r
            .save_activity_template("Field Day", "Field Day", "other", None, None, None, None, None)
            .unwrap();
        r.update_activity_template(&id, "Tuesday", "Tuesday Net", "simple_net", Some("20:00"), None, None, None, None)
            .unwrap();
        let renamed = r.list_activity_templates().unwrap();
        assert!(renamed.iter().any(|t| t.name == "Tuesday" && t.scheduled_time == "20:00"));
        assert!(r
            .update_activity_template(&id, "field day", "x", "other", None, None, None, None, None)
            .is_err());
        r.delete_activity_template(&other).unwrap();

        r.delete_activity_template(&id).unwrap();
        assert!(r.list_activity_templates().unwrap().is_empty());
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;

    fn repo() -> Repository {
        let path = std::env::temp_dir().join(format!("roc-life-{}.db", Uuid::new_v4()));
        Repository::new(crate::db::open_db(&path).unwrap())
    }

    #[test]
    fn walks_the_lifecycle_and_records_each_step() {
        let r = repo();
        let id = r.create_activity("Net", "weekly_net", Some("2026-09-21"), None).unwrap();
        assert_eq!(r.get_activity(&id).unwrap().state, "scheduled");

        r.transition_activity(&id, "active", None, None, None).unwrap();
        let a = r.get_activity(&id).unwrap();
        assert_eq!(a.state, "active");
        assert!(!a.opened_at.is_empty());

        r.transition_activity(&id, "closed", None, Some("  Good turnout  "), None).unwrap();
        let a = r.get_activity(&id).unwrap();
        assert_eq!(a.state, "closed");
        assert_eq!(a.conclusion, "Good turnout");
        assert!(!a.closed_at.is_empty());
        assert!(r.is_activity_closed(&id));

        r.transition_activity(&id, "active", Some("Late check-in"), None, None).unwrap();
        let a = r.get_activity(&id).unwrap();
        assert_eq!(a.state, "active");
        assert!(a.closed_at.is_empty());
        assert_eq!(a.conclusion, "Good turnout", "closing notes are kept");
        assert!(!r.is_activity_closed(&id));

        let events = r.list_audit_events(&id).unwrap();
        let actions: Vec<_> = events.iter().map(|e| e.action.as_str()).collect();
        for expected in ["started", "closed", "reopened"] {
            assert!(actions.contains(&expected), "{actions:?}");
        }
        let reopened = events.iter().find(|e| e.action == "reopened").unwrap();
        assert!(reopened.data.contains("Late check-in") && reopened.data.contains("utc_time"));
    }

    #[test]
    fn refuses_invalid_transitions_and_reopening_without_a_reason() {
        let r = repo();
        let id = r.create_activity("Net", "weekly_net", None, None).unwrap();
        // Can't close what never started, or start twice.
        assert!(r.transition_activity(&id, "closed", None, None, None).is_err());
        r.transition_activity(&id, "active", None, None, None).unwrap();
        assert!(r.transition_activity(&id, "active", None, None, None).is_err());
        r.transition_activity(&id, "closed", None, None, None).unwrap();
        assert!(r.transition_activity(&id, "active", None, None, None).is_err());
        assert!(r.transition_activity(&id, "active", Some("   "), None, None).is_err());
        assert_eq!(r.get_activity(&id).unwrap().state, "closed");
    }

    #[test]
    fn summary_counts_what_happened() {
        let r = repo();
        let id = r.create_activity("Net", "weekly_net", None, None).unwrap();
        for call in ["K4ABC", "k4abc", "W1XYZ"] {
            r.create_checkin(&id, call, None, None, None, None, None, None, None, None, false, None, &ContactDetails::default()).unwrap();
        }
        let gone = r.create_checkin(&id, "N0BAD", None, None, None, None, None, None, None, None, true, Some("voided"), &ContactDetails::default()).unwrap();
        r.void_checkin(&gone, None).unwrap();

        // Two stations with traffic (one handled), plus one with none.
        let t1 = r.create_checkin(&id, "W2TRF", None, None, None, None, None, None, None, None, true, Some("Need generator"), &ContactDetails::default()).unwrap();
        r.create_checkin(&id, "W3TRF", None, None, None, None, None, None, None, None, true, None, &ContactDetails::default()).unwrap();
        r.set_checkin_traffic_handled(&t1, true).unwrap();
        r.create_audit_event("activity", &id, "activity_entry", Some("Net opened"), None).unwrap();

        let s = r.activity_summary(&id).unwrap();
        assert_eq!(s.checkins, 5);
        assert_eq!(s.unique_stations, 4, "call signs are compared without regard to case");
        assert_eq!(s.removed_checkins, 1);
        assert_eq!(s.traffic_items, 2);
        assert_eq!(s.open_traffic_items, 1);
        assert!(!s.first_checkin_at.is_empty());
    }

    #[test]
    fn history_gathers_events_across_an_activitys_records_with_operators() {
        let r = repo();
        let op = r.create_operator("Bob Nelson", Some("K4NCS")).unwrap();
        let a = r.create_activity("Net", "directed_net", None, None).unwrap();
        let other = r.create_activity("Other net", "directed_net", None, None).unwrap();
        let c = r.create_checkin(&a, "W1XYZ", None, None, None, None, None, None, None, None, false, None, &ContactDetails::default()).unwrap();
        let c_other = r.create_checkin(&other, "W9OTH", None, None, None, None, None, None, None, None, false, None, &ContactDetails::default()).unwrap();

        r.transition_activity(&a, "active", None, None, Some(&op)).unwrap();
        r.create_audit_event("checkin", &c, "correct", Some("{}"), Some(&op)).unwrap();
        r.create_audit_event("activity", &a, "activity_entry", Some("Net opened"), None).unwrap();
        r.create_audit_event("checkin", &c_other, "correct", Some("{}"), Some(&op)).unwrap();

        let h = r.activity_history(&a).unwrap();
        let actions: Vec<_> = h.iter().map(|e| e.action.as_str()).collect();
        assert_eq!(actions, ["started", "correct", "activity_entry"], "in order, and not the other net's");
        assert_eq!(h[0].operator, "Bob Nelson (K4NCS)");
        assert_eq!(h[2].operator, "");
    }

    #[test]
    fn summary_breaks_spotter_reports_down_by_hazard_and_types_are_stored() {
        let r = repo();
        let id = r.create_activity("Storm Net", "skywarn", None, None).unwrap();
        assert_eq!(r.get_activity(&id).unwrap().activity_type, "skywarn");
        for hazard in ["Hail", "Hail", "Tornado"] {
            r.create_spotter_report(&id, "2026-01-01T12:00", None, None, None, None, None, hazard, None, None, None, None, None)
                .unwrap();
        }
        let s = r.activity_summary(&id).unwrap();
        assert_eq!(s.spotter_reports, 3);
        assert_eq!(s.hazards[0].hazard_type, "Hail");
        assert_eq!(s.hazards[0].count, 2);
        assert_eq!(s.hazards.len(), 2);

        // Types are free-form names; a blank one means "other".
        r.update_activity(&id, "Storm Net", "  ", None, None).unwrap();
        assert_eq!(r.get_activity(&id).unwrap().activity_type, "other");
        r.update_activity(&id, "Storm Net", "directed_net", None, None).unwrap();
        assert_eq!(r.get_activity(&id).unwrap().activity_type, "directed_net");
    }

}

#[cfg(test)]
mod deletion_tests {
    use super::*;

    fn repo_at() -> (Repository, std::path::PathBuf) {
        let path = std::env::temp_dir().join(format!("roc-del-{}.db", Uuid::new_v4()));
        (Repository::new(crate::db::open_db(&path).unwrap()), path)
    }

    fn repo() -> Repository {
        repo_at().0
    }

    /// An activity with a check-in (later removed), another check-in, a spotter
    /// report linked to it, and history on each.
    fn populated(r: &Repository, op: &str) -> (String, String, String) {
        let a = r.create_activity("Storm Net", "skywarn", None, None).unwrap();
        let c = r
            .create_checkin(&a, "ZZ9SECRET", Some("Secret Person"), None, None, Some("99 Hidden Lane"), Some(op), None, None, None, false, None, &ContactDetails::default())
            .unwrap();
        let c2 = r.create_checkin(&a, "W1AW", None, None, None, None, Some(op), None, None, None, false, None, &ContactDetails::default()).unwrap();
        r.void_checkin(&c2, Some("dup")).unwrap();
        let s = r
            .create_spotter_report(&a, "2026-09-21T19:00", None, None, None, None, Some("ZZ9SECRET"), "hail", None, None, Some("Secret notes"), Some(&c), Some(op))
            .unwrap();
        r.create_audit_event("checkin", &c, "correct", Some("{\"before\":\"Secret Person\"}"), Some(op)).unwrap();
        r.create_audit_event("spotter_report", &s, "correct", Some("{}"), Some(op)).unwrap();
        r.create_audit_event("activity", &a, "activity_entry", Some("Net opened"), Some(op)).unwrap();
        (a, c, s)
    }

    fn count(r: &Repository, sql: &str, id: &str) -> i64 {
        r.conn.query_row(sql, params![id], |row| row.get(0)).unwrap()
    }

    #[test]
    fn previews_what_an_activity_delete_will_erase() {
        let r = repo();
        let op = r.create_operator("Pat", Some("K8ABC")).unwrap();
        let (a, _, _) = populated(&r, &op);
        assert_eq!(r.activity_contents(&a).unwrap(), DeletedCounts { checkins: 2, spotter_reports: 1 });
    }

    #[test]
    fn deleting_an_activity_erases_it_and_everything_recorded_on_it() {
        let r = repo();
        let op = r.create_operator("Pat", Some("K8ABC")).unwrap();
        let (a, c, s) = populated(&r, &op);
        let other = r.create_activity("Other Net", "simple_net", None, None).unwrap();
        let kept = r.create_checkin(&other, "N0KEEP", None, None, None, None, Some(&op), None, None, None, false, None, &ContactDetails::default()).unwrap();

        let counts = r.delete_activity_permanently(&a, Some(&op)).unwrap();
        assert_eq!(counts, DeletedCounts { checkins: 2, spotter_reports: 1 });

        assert!(r.get_activity(&a).is_err());
        assert_eq!(count(&r, "SELECT count(*) FROM checkins WHERE activity_id = ?1", &a), 0);
        assert_eq!(count(&r, "SELECT count(*) FROM spotter_reports WHERE activity_id = ?1", &a), 0);
        for id in [&c, &s] {
            assert_eq!(count(&r, "SELECT count(*) FROM audit_events WHERE entity_id = ?1", id), 0);
        }
        // Other activities are untouched.
        assert_eq!(count(&r, "SELECT count(*) FROM checkins WHERE id = ?1", &kept), 1);
        assert!(r.get_activity(&other).is_ok());
    }

    #[test]
    fn leaves_one_event_saying_what_was_deleted_without_the_content() {
        let r = repo();
        let op = r.create_operator("Pat", Some("K8ABC")).unwrap();
        let (a, _, _) = populated(&r, &op);
        r.delete_activity_permanently(&a, Some(&op)).unwrap();

        let events = r.list_audit_events(&a).unwrap();
        assert_eq!(events.len(), 1, "{events:?}");
        assert_eq!(events[0].action, "delete_permanently");
        let data: serde_json::Value = serde_json::from_str(&events[0].data).unwrap();
        assert_eq!(data["title"], "Storm Net");
        assert_eq!(data["checkins"], 2);
        assert_eq!(data["spotter_reports"], 1);
        assert!(!events[0].data.contains("SECRET"));
        let by: Option<String> = r
            .conn
            .query_row("SELECT operator_id FROM audit_events WHERE entity_id = ?1", params![a], |row| row.get(0))
            .unwrap();
        assert_eq!(by.as_deref(), Some(op.as_str()));
    }

    #[test]
    fn erased_text_is_overwritten_in_the_database_file() {
        let (r, path) = repo_at();
        let op = r.create_operator("Pat", None).unwrap();
        let (a, _, _) = populated(&r, &op);
        r.delete_activity_permanently(&a, Some(&op)).unwrap();

        let mut bytes = std::fs::read(&path).unwrap();
        bytes.extend(std::fs::read(path.with_extension("db-wal")).unwrap_or_default());
        let has = |needle: &str| bytes.windows(needle.len()).any(|w| w == needle.as_bytes());
        for secret in ["ZZ9SECRET", "Secret Person", "99 Hidden Lane", "Secret notes"] {
            assert!(!has(secret), "{secret} still on disk");
        }
    }

    #[test]
    fn deleting_a_missing_activity_is_an_error() {
        let r = repo();
        assert!(r.delete_activity_permanently("nope", None).is_err());
    }

    #[test]
    fn an_operator_with_no_records_can_be_deleted() {
        let r = repo();
        let op = r.create_operator("Typo", Some("K8ABX")).unwrap();
        assert!(!r.operator_has_records(&op).unwrap());
        r.delete_operator(&op).unwrap();
        assert!(r.get_operator(&op).is_err());
    }

    #[test]
    fn an_operator_with_records_cannot_be_deleted_only_retired() {
        let r = repo();
        let op = r.create_operator("Pat", Some("K8ABC")).unwrap();
        let a = r.create_activity("Net", "simple_net", None, None).unwrap();
        r.create_checkin(&a, "W1AW", None, None, None, None, Some(&op), None, None, None, false, None, &ContactDetails::default()).unwrap();
        assert!(r.operator_has_records(&op).unwrap());
        assert!(r.delete_operator(&op).is_err());
        assert!(r.get_operator(&op).is_ok());

        r.retire_operator(&op).unwrap();
        assert!(r.list_operators().unwrap().iter().all(|o| o.id != op), "hidden from lists");
        assert_eq!(r.list_retired_operators().unwrap()[0].id, op);
        assert_eq!(r.get_operator(&op).unwrap().display_name, "Pat", "still resolvable for history");

        r.restore_operator(&op).unwrap();
        assert!(r.list_operators().unwrap().iter().any(|o| o.id == op));
        assert!(r.list_retired_operators().unwrap().is_empty());
    }

    #[test]
    fn history_entries_or_reports_also_count_as_records() {
        let r = repo();
        let by_event = r.create_operator("A", None).unwrap();
        r.create_audit_event("activity", "x", "activity_entry", None, Some(&by_event)).unwrap();
        assert!(r.operator_has_records(&by_event).unwrap());

        let by_report = r.create_operator("B", None).unwrap();
        let a = r.create_activity("Net", "skywarn", None, None).unwrap();
        r.create_spotter_report(&a, "2026-09-21T19:00", None, None, None, None, None, "hail", None, None, None, None, Some(&by_report))
            .unwrap();
        assert!(r.operator_has_records(&by_report).unwrap());
    }

    #[test]
    fn retiring_and_restoring_alone_dont_make_an_operator_undeletable() {
        let r = repo();
        let op = r.create_operator("Typo", None).unwrap();
        r.retire_operator(&op).unwrap();
        r.create_audit_event("operator", &op, "retire", None, Some(&op)).unwrap();
        r.restore_operator(&op).unwrap();
        r.create_audit_event("operator", &op, "restore", None, Some(&op)).unwrap();
        assert!(!r.operator_has_records(&op).unwrap());
        r.delete_operator(&op).unwrap();
        assert_eq!(count(&r, "SELECT count(*) FROM audit_events WHERE entity_id = ?1", &op), 0);
    }
}

#[cfg(test)]
mod contact_tests {
    use super::*;

    fn repo() -> Repository {
        let path = std::env::temp_dir().join(format!("roc-contact-{}.db", Uuid::new_v4()));
        Repository::new(crate::db::open_db(&path).unwrap())
    }

    fn contact(r: &Repository, activity: &str, call: &str, name: Option<&str>, details: &ContactDetails) -> String {
        r.create_checkin(activity, call, name, None, None, None, None, None, None, None, false, None, details)
            .unwrap()
    }

    #[test]
    fn contact_details_are_stored_and_blank_ones_left_empty() {
        let r = repo();
        let log = r.create_activity("Simplex log", "station_log", None, Some("146.520")).unwrap();
        let details = ContactDetails {
            contacted_at: Some("2026-09-14T14:05:00+00:00".into()),
            frequency: Some(" 146.520 ".into()),
            mode: Some("FM".into()),
            rst_sent: Some("59".into()),
            rst_received: Some("57".into()),
            power: Some("5 W".into()),
            antenna: Some("".into()),
            notes: Some("Mobile on I-75".into()),
            ..Default::default()
        };
        let id = contact(&r, &log, "KD4ABC", None, &details);
        let c = r.get_checkin(&id).unwrap();
        assert_eq!(c.checked_in_at, "2026-09-14T14:05:00+00:00", "the contact's own time");
        assert_eq!((c.frequency.as_str(), c.mode.as_str()), ("146.520", "FM"));
        assert_eq!((c.rst_sent.as_str(), c.rst_received.as_str()), ("59", "57"));
        assert_eq!((c.power.as_str(), c.antenna.as_str(), c.notes.as_str()), ("5 W", "", "Mobile on I-75"));

        // Nothing given: stamped now, nothing else set.
        let bare = r.get_checkin(&contact(&r, &log, "W1AW", None, &ContactDetails::default())).unwrap();
        assert!(bare.checked_in_at > c.checked_in_at);
        assert!(bare.frequency.is_empty() && bare.notes.is_empty());
    }

    #[test]
    fn range_check_station_type_and_cross_street_are_stored_and_corrected() {
        // RANGE-010, RANGE-017
        let r = repo();
        let rc = r.create_activity("Repeater range check", "range_check", None, None).unwrap();
        let report = ContactDetails {
            station_kind: Some("base".into()),
            cross_street: Some(" Colonial & Mills ".into()),
            antenna: Some("Diamond X50".into()),
            ..Default::default()
        };
        let id = contact(&r, &rc, "KD4ABC", None, &report);
        let c = r.get_checkin(&id).unwrap();
        assert_eq!((c.station_kind.as_str(), c.cross_street.as_str()), ("base", "Colonial & Mills"));

        let moved = ContactDetails { station_kind: Some("ht".into()), cross_street: Some("Orange & Church".into()), ..Default::default() };
        r.update_checkin(&id, "KD4ABC", None, None, None, None, None, None, None, false, None, Some(&moved)).unwrap();
        let c = r.get_checkin(&id).unwrap();
        assert_eq!((c.station_kind.as_str(), c.cross_street.as_str(), c.antenna.as_str()), ("ht", "Orange & Church", ""));
    }

    #[test]
    fn corrections_replace_contact_details_only_when_given() {
        let r = repo();
        let log = r.create_activity("Simplex log", "station_log", None, None).unwrap();
        let id = contact(&r, &log, "KD4ABC", None, &ContactDetails { mode: Some("FM".into()), rst_sent: Some("59".into()), ..Default::default() });
        let upd = |c: Option<&ContactDetails>| {
            r.update_checkin(&id, "KD4ABC", Some("Pat"), None, None, None, None, None, None, false, None, c).unwrap()
        };

        // A name filled in by a lookup leaves the contact details alone.
        upd(None);
        let c = r.get_checkin(&id).unwrap();
        assert_eq!((c.name.as_str(), c.mode.as_str(), c.rst_sent.as_str()), ("Pat", "FM", "59"));

        // An edit replaces them (clearing what was blanked) and can move the time.
        let at = "2026-01-02T03:04:05+00:00";
        upd(Some(&ContactDetails { contacted_at: Some(at.into()), mode: Some("SSB".into()), ..Default::default() }));
        let c = r.get_checkin(&id).unwrap();
        assert_eq!((c.mode.as_str(), c.rst_sent.as_str(), c.checked_in_at.as_str()), ("SSB", "", at));

        // Given details without a time keep the time.
        upd(Some(&ContactDetails::default()));
        assert_eq!(r.get_checkin(&id).unwrap().checked_in_at, at);
    }

    #[test]
    fn station_history_spans_activities_and_ignores_removed_records() {
        let r = repo();
        let net = r.create_activity("Tuesday Net", "directed_net", None, Some("147.000")).unwrap();
        let log = r.create_activity("Simplex log", "station_log", None, None).unwrap();
        let at = |t: &str| ContactDetails { contacted_at: Some(t.into()), ..Default::default() };

        assert_eq!(r.station_history("KD4ABC").unwrap(), StationHistory { count: 0, last: None });

        r.create_checkin(&net, "KD4ABC", Some("Pat"), Some("Orlando"), None, None, None, None, None, None, false, None, &at("2026-09-01T00:00:00+00:00")).unwrap();
        contact(&r, &log, "kd4abc", None, &ContactDetails { frequency: Some("146.520".into()), ..at("2026-09-14T00:00:00+00:00") });
        let removed = contact(&r, &log, "KD4ABC", Some("Wrong"), &at("2026-09-20T00:00:00+00:00"));
        r.void_checkin(&removed, None).unwrap();
        contact(&r, &log, "W1AW", Some("Hiram"), &ContactDetails::default());

        let h = r.station_history(" Kd4Abc ").unwrap();
        assert_eq!(h.count, 2, "case-insensitive, removed one not counted");
        let last = h.last.unwrap();
        assert_eq!(last.activity_title, "Simplex log");
        assert_eq!(last.frequency, "146.520");
        assert!(last.at.starts_with("2026-09-14"));
        // The latest contact had no name/QTH: the most recent known ones are shown.
        assert_eq!((last.name.as_str(), last.qth_location.as_str()), ("Pat", "Orlando"));

        // A contact with no frequency of its own falls back to its activity's.
        r.void_checkin(&r.list_checkins(&log).unwrap().iter().find(|c| c.call_sign == "kd4abc").unwrap().id, None).unwrap();
        let only_net = r.station_history("KD4ABC").unwrap().last.unwrap();
        assert_eq!((only_net.activity_id, only_net.frequency.as_str()), (net, "147.000"));
    }
}
