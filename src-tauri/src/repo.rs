use chrono::Utc;
use rusqlite::{params, Connection};
use serde::Serialize;
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
}

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

    const ACTIVITY_COLS: &'static str = "id, title, type, coalesce(scheduled_at,''), coalesce(frequency,''), coalesce(location_label,''), location_lat, location_lon, state, coalesce(opened_at,''), coalesce(closed_at,''), coalesce(conclusion,'')";

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
    ) -> rusqlite::Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO checkins(id, activity_id, call_sign, name, qth_location, grid_square, address, checked_in_at, entered_at, operator_id, location_lat, location_lon, location_label, has_traffic, traffic) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            params![id, activity_id, call_sign, name, qth_location, grid_square, address, now, now, operator_id, location_lat, location_lon, location_label, has_traffic, if has_traffic { traffic } else { None }],
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
        })
    }

    pub fn list_checkins(&self, activity_id: &str) -> rusqlite::Result<Vec<Checkin>> {
        let mut stmt = self.conn.prepare("SELECT id, call_sign, coalesce(name,''), coalesce(qth_location,''), coalesce(grid_square,''), coalesce(address,''), checked_in_at, location_lat, location_lon, coalesce(location_label,''), has_traffic, coalesce(traffic,''), traffic_handled FROM checkins WHERE activity_id = ?1 AND voided_at IS NULL ORDER BY checked_in_at DESC")?;
        let rows = stmt.query_map(params![activity_id], Self::map_checkin)?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        Ok(v)
    }

    pub fn list_voided_checkins(&self, activity_id: &str) -> rusqlite::Result<Vec<Checkin>> {
        let mut stmt = self.conn.prepare("SELECT id, call_sign, coalesce(name,''), coalesce(qth_location,''), coalesce(grid_square,''), coalesce(address,''), checked_in_at, location_lat, location_lon, coalesce(location_label,''), has_traffic, coalesce(traffic,''), traffic_handled FROM checkins WHERE activity_id = ?1 AND voided_at IS NOT NULL ORDER BY voided_at DESC")?;
        let rows = stmt.query_map(params![activity_id], Self::map_checkin)?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        Ok(v)
    }

    pub fn get_checkin(&self, id: &str) -> rusqlite::Result<Checkin> {
        self.conn.query_row(
            "SELECT id, call_sign, coalesce(name,''), coalesce(qth_location,''), coalesce(grid_square,''), coalesce(address,''), checked_in_at, location_lat, location_lon, coalesce(location_label,''), has_traffic, coalesce(traffic,''), traffic_handled FROM checkins WHERE id = ?1",
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
    ) -> rusqlite::Result<()> {
        // Clearing "has traffic" also clears its details and handled mark.
        self.conn.execute(
            "UPDATE checkins SET call_sign = ?1, name = ?2, qth_location = ?3, grid_square = ?4, address = ?5, location_lat = ?6, location_lon = ?7, location_label = ?8, has_traffic = ?9, traffic = ?10, traffic_handled = CASE WHEN ?9 THEN traffic_handled ELSE 0 END WHERE id = ?11",
            params![call_sign, name, qth_location, grid_square, address, location_lat, location_lon, location_label, has_traffic, if has_traffic { traffic } else { None }, id],
        )?;
        Ok(())
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
            r.create_checkin(&id, call, None, None, None, None, None, None, None, None, false, None).unwrap();
        }
        let gone = r.create_checkin(&id, "N0BAD", None, None, None, None, None, None, None, None, true, Some("voided")).unwrap();
        r.void_checkin(&gone, None).unwrap();

        // Two stations with traffic (one handled), plus one with none.
        let t1 = r.create_checkin(&id, "W2TRF", None, None, None, None, None, None, None, None, true, Some("Need generator")).unwrap();
        r.create_checkin(&id, "W3TRF", None, None, None, None, None, None, None, None, true, None).unwrap();
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
        let c = r.create_checkin(&a, "W1XYZ", None, None, None, None, None, None, None, None, false, None).unwrap();
        let c_other = r.create_checkin(&other, "W9OTH", None, None, None, None, None, None, None, None, false, None).unwrap();

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
            .create_checkin(&a, "ZZ9SECRET", Some("Secret Person"), None, None, Some("99 Hidden Lane"), Some(op), None, None, None, false, None)
            .unwrap();
        let c2 = r.create_checkin(&a, "W1AW", None, None, None, None, Some(op), None, None, None, false, None).unwrap();
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
        let kept = r.create_checkin(&other, "N0KEEP", None, None, None, None, Some(&op), None, None, None, false, None).unwrap();

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
        r.create_checkin(&a, "W1AW", None, None, None, None, Some(&op), None, None, None, false, None).unwrap();
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
