use chrono::{DateTime, Utc};
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
    /// The operator running it (net control), or empty if none was set.
    pub operator_id: String,
    /// The event it belongs to (events.rs), or empty; and that event's name.
    pub event_id: String,
    pub event: String,
    /// Its records, not counting removed ones: check-ins (a station log's
    /// contacts), or a relay's messages (UX-OPS-015).
    pub record_count: i64,
}

/// Whether a relay message `m` has an outcome (passed or given up on).
const RELAY_HAS_OUTCOME: &str = "EXISTS(SELECT 1 FROM relay_steps s WHERE s.message_id = m.id AND s.voided_at IS NULL AND s.kind != 'attempt')";
/// A relay message `m`'s latest outcome, matching relay::status_of.
const RELAY_LAST_OUTCOME: &str = "(SELECT s.kind FROM relay_steps s WHERE s.message_id = m.id AND s.voided_at IS NULL AND s.kind != 'attempt' ORDER BY s.at DESC, s.rowid DESC LIMIT 1)";

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
    /// Messages received to relay (relay.rs).
    pub relay_messages: i64,
    /// Relay messages not yet passed on or given up on.
    pub held_relay_messages: i64,
    /// Relay messages that couldn't be passed on.
    pub unpassed_relay_messages: i64,
    /// The weather as it started and ended, or why there's none (start first).
    pub weather: Vec<crate::weather::ActivityWeather>,
    /// The largest hail and strongest wind reported, as the magnitude was
    /// given ("1.75 in (Golf Ball)"), or "" when none was.
    pub largest_hail: String,
    pub strongest_wind: String,
    /// Spotter reports by county, most numerous first (reports with no county left out).
    pub counties: Vec<CountyCount>,
    /// The NWS alerts attached to the net, oldest first (SPOT-060).
    pub alerts: Vec<ActivityAlert>,
}

#[derive(Serialize, Debug, Clone)]
pub struct HazardCount {
    pub hazard_type: String,
    pub count: i64,
}

#[derive(Serialize, Debug, Clone)]
pub struct CountyCount {
    pub county: String,
    pub count: i64,
}

/// An NWS alert attached to a net, as it was when attached (SPOT-060).
#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(default)]
pub struct ActivityAlert {
    pub id: String,
    pub nws_id: String,
    pub event: String,
    pub headline: String,
    pub area_desc: String,
    pub severity: String,
    pub effective: String,
    pub ends: String,
    pub attached_at: String,
}

/// The leading number of a magnitude ("1.75 in (Golf Ball)" → 1.75,
/// "58-73 mph" → 58, "90+ mph" → 90), or None for words alone.
fn magnitude_size(m: &str) -> Option<f64> {
    let m = m.trim_start();
    let end = m.find(|c: char| !(c.is_ascii_digit() || c == '.')).unwrap_or(m.len());
    m[..end].parse().ok()
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
    /// The location was placed by hand, so Lookup and edits leave it alone.
    pub location_manual: bool,
    /// How the map point was arrived at (LOCRES-064): "pin", "zip", "crossing"…,
    /// or "" when not known.
    pub location_how: String,
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

/// Leaves out net control's own lines (notes logged with no station,
/// NETOPS-060): they're not check-ins, stations, or traffic.
const STATIONS_ONLY: &str = "coalesce(station_kind,'') <> 'net_control'";

/// Columns `map_alert` reads, in order.
const ALERT_COLUMNS: &str = "id, nws_id, event, headline, area_desc, severity, effective, ends, attached_at";

/// Columns `map_checkin` reads, in order.
const CHECKIN_COLUMNS: &str = "id, call_sign, coalesce(name,''), coalesce(qth_location,''), coalesce(grid_square,''), coalesce(address,''), checked_in_at, location_lat, location_lon, coalesce(location_label,''), has_traffic, coalesce(traffic,''), traffic_handled, coalesce(frequency,''), coalesce(mode,''), coalesce(rst_sent,''), coalesce(rst_received,''), coalesce(power,''), coalesce(antenna,''), coalesce(notes,''), coalesce(station_kind,''), coalesce(cross_street,''), location_manual, location_how";

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
    /// How the map point was arrived at (LOCRES-064), or "".
    pub location_how: String,
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

/// One line of the History tab (AUDIT-020): an event, with what it's about
/// and the activity it belongs to, named.
#[derive(Serialize, Debug, Clone)]
pub struct HistoryEntry {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub action: String,
    pub data: String,
    /// Who did it (display name and call sign), or empty.
    pub operator: String,
    pub created_at: String,
    /// What it's about, by name ("W4ABC", "Tuesday Net"), or empty if since deleted.
    pub subject: String,
    /// The activity it belongs to (itself, for an activity), or empty.
    pub activity_id: String,
    pub activity_title: String,
}

/// Where an operator is named, for removing them (`operator_usage`).
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct OperatorUsage {
    /// Activities they run or recorded something in, newest first.
    pub activities: Vec<OperatorActivityUse>,
    /// Their history entries on anything outside an activity, by kind.
    pub other_history: Vec<HistoryKindCount>,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct OperatorActivityUse {
    pub id: String,
    pub title: String,
    /// They're its operator (net control).
    pub runs: bool,
    pub checkins: i64,
    pub spotter_reports: i64,
    /// Relay messages and steps.
    pub relay: i64,
    /// History entries they made on it or its records.
    pub history: i64,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct HistoryKindCount {
    /// "repeater", "place", "net_listing", "operator", "ics214_log", ...
    pub kind: String,
    pub count: i64,
}

/// How many records an activity holds, or held before it was deleted.
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct DeletedCounts {
    pub checkins: u32,
    pub spotter_reports: u32,
    pub relay_messages: u32,
}

impl Repository {
    pub fn new(conn: Connection) -> Self {
        Self { conn }
    }

    /// Corrects an operator's name and call sign. Everything they recorded
    /// keeps pointing at them, so it shows the corrected name.
    pub fn update_operator(&self, id: &str, display_name: &str, call_sign: Option<&str>) -> rusqlite::Result<()> {
        let n = self.conn.execute(
            "UPDATE operators SET display_name = ?1, call_sign = ?2 WHERE id = ?3",
            params![display_name, call_sign, id],
        )?;
        if n == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
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

    /// Where an operator is named (AUDIT-013): each activity they run or
    /// recorded something in, and their history entries on anything else, so
    /// the operator knows where to go to change it.
    pub fn operator_usage(&self, id: &str) -> rusqlite::Result<OperatorUsage> {
        let mut stmt = self.conn.prepare(
            "SELECT a.id, a.title, coalesce(a.operator_id = ?1, 0), \
                (SELECT count(*) FROM checkins WHERE activity_id = a.id AND operator_id = ?1), \
                (SELECT count(*) FROM spotter_reports WHERE activity_id = a.id AND operator_id = ?1), \
                (SELECT count(*) FROM relay_messages WHERE activity_id = a.id AND operator_id = ?1) \
                  + (SELECT count(*) FROM relay_steps s JOIN relay_messages m ON m.id = s.message_id \
                     WHERE m.activity_id = a.id AND s.operator_id = ?1), \
                (SELECT count(*) FROM audit_events e WHERE e.operator_id = ?1 AND (e.entity_id = a.id \
                    OR e.entity_id IN (SELECT id FROM checkins WHERE activity_id = a.id) \
                    OR e.entity_id IN (SELECT id FROM spotter_reports WHERE activity_id = a.id) \
                    OR e.entity_id IN (SELECT id FROM relay_messages WHERE activity_id = a.id))) \
             FROM activities a ORDER BY coalesce(a.opened_at, a.scheduled_at, a.created_at) DESC",
        )?;
        let activities = stmt
            .query_map(params![id], |r| {
                Ok(OperatorActivityUse {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    runs: r.get(2)?,
                    checkins: r.get(3)?,
                    spotter_reports: r.get(4)?,
                    relay: r.get(5)?,
                    history: r.get(6)?,
                })
            })?
            .filter(|u| u.as_ref().map(|u| u.runs || u.checkins + u.spotter_reports + u.relay + u.history > 0).unwrap_or(true))
            .collect::<rusqlite::Result<Vec<_>>>()?;
        // History on anything not in an activity (repeaters, places, net
        // listings, other operators, ICS 214 logs), by kind.
        let mut stmt = self.conn.prepare(
            "SELECT entity_type, count(*) FROM audit_events e WHERE e.operator_id = ?1 \
               AND NOT (e.entity_type = 'operator' AND e.entity_id = ?1) \
               AND e.entity_id NOT IN (SELECT id FROM activities) \
               AND e.entity_id NOT IN (SELECT id FROM checkins) \
               AND e.entity_id NOT IN (SELECT id FROM spotter_reports) \
               AND e.entity_id NOT IN (SELECT id FROM relay_messages) \
             GROUP BY entity_type ORDER BY entity_type",
        )?;
        let other_history = stmt
            .query_map(params![id], |r| Ok(HistoryKindCount { kind: r.get(0)?, count: r.get(1)? }))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(OperatorUsage { activities, other_history })
    }

    /// Whether anything names this operator: a check-in, a spotter report, or
    /// a history event (other than the operator's own retire/restore events).
    pub fn operator_has_records(&self, id: &str) -> rusqlite::Result<bool> {
        self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM checkins WHERE operator_id = ?1) \
                 OR EXISTS(SELECT 1 FROM spotter_reports WHERE operator_id = ?1) \
                 OR EXISTS(SELECT 1 FROM relay_messages WHERE operator_id = ?1) \
                 OR EXISTS(SELECT 1 FROM activities WHERE operator_id = ?1) \
                 OR EXISTS(SELECT 1 FROM relay_steps WHERE operator_id = ?1) \
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

    const ACTIVITY_COLS: &'static str = "id, title, type, coalesce(scheduled_at,''), coalesce(frequency,''), coalesce(location_label,''), location_lat, location_lon, state, coalesce(opened_at,''), coalesce(closed_at,''), coalesce(conclusion,''), coalesce(repeater_name,''), repeater_lat, repeater_lon, coalesce(operator_id,''), coalesce(event_id,''), coalesce((SELECT name FROM events WHERE events.id = activities.event_id),''), \
        CASE WHEN type = 'relay' \
            THEN (SELECT COUNT(*) FROM relay_messages m WHERE m.activity_id = activities.id AND m.voided_at IS NULL) \
            ELSE (SELECT COUNT(*) FROM checkins c WHERE c.activity_id = activities.id AND c.voided_at IS NULL \
                AND coalesce(c.station_kind,'') <> 'net_control') END";

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
            operator_id: r.get(15)?,
            event_id: r.get(16)?,
            event: r.get(17)?,
            record_count: r.get(18)?,
        })
    }

    pub fn list_activities(&self) -> rusqlite::Result<Vec<Activity>> {
        let mut stmt = self.conn.prepare(&format!("SELECT {} FROM activities ORDER BY scheduled_at DESC, created_at DESC", Self::ACTIVITY_COLS))?;
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
    /// ones too), spotter reports, and relayed messages (AUDIT-008).
    pub fn activity_contents(&self, id: &str) -> rusqlite::Result<DeletedCounts> {
        self.conn.query_row(
            "SELECT (SELECT count(*) FROM checkins WHERE activity_id = ?1), \
                    (SELECT count(*) FROM spotter_reports WHERE activity_id = ?1), \
                    (SELECT count(*) FROM relay_messages WHERE activity_id = ?1)",
            params![id],
            |r| Ok(DeletedCounts { checkins: r.get(0)?, spotter_reports: r.get(1)?, relay_messages: r.get(2)? }),
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
                OR entity_id IN (SELECT id FROM spotter_reports WHERE activity_id = ?1) \
                OR entity_id IN (SELECT id FROM relay_messages WHERE activity_id = ?1)",
            "DELETE FROM relay_steps WHERE message_id IN (SELECT id FROM relay_messages WHERE activity_id = ?1)",
            // Replies point at other messages of the same activity.
            "UPDATE relay_messages SET reply_to = NULL WHERE activity_id = ?1",
            "DELETE FROM relay_messages WHERE activity_id = ?1",
            "DELETE FROM spotter_reports WHERE activity_id = ?1",
            "DELETE FROM checkins WHERE activity_id = ?1",
            "DELETE FROM activity_weather WHERE activity_id = ?1",
            "DELETE FROM activity_alerts WHERE activity_id = ?1",
            "DELETE FROM activities WHERE id = ?1",
        ] {
            tx.execute(sql, params![id]).map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        let data = serde_json::json!({
            "title": activity.title,
            "checkins": counts.checkins,
            "spotter_reports": counts.spotter_reports,
            "relay_messages": counts.relay_messages,
        })
        .to_string();
        self.create_audit_event("activity", id, "delete_permanently", Some(&data), operator_id)
            .map_err(|e| e.to_string())?;
        self.conn
            .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))
            .map_err(|e| e.to_string())?;
        Ok(counts)
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
            params![id, activity_id, call_sign, name, qth_location, grid_square, address, at, now, operator_id, location_lat, location_lon, location_label, has_traffic,
                // A note from net control is its text, though it isn't traffic (NETOPS-060).
                if has_traffic || f(&contact.station_kind) == Some("net_control") { traffic } else { None },
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
            location_manual: r.get(22)?,
            location_how: r.get(23)?,
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
            "UPDATE checkins SET call_sign = ?1, name = ?2, qth_location = ?3, grid_square = ?4, address = ?5, location_lat = ?6, location_lon = ?7, location_label = ?8, has_traffic = ?9, \
             traffic = CASE WHEN ?9 OR coalesce(station_kind,'') = 'net_control' THEN ?10 END, \
             traffic_handled = CASE WHEN ?9 THEN traffic_handled ELSE 0 END WHERE id = ?11",
            params![call_sign, name, qth_location, grid_square, address, location_lat, location_lon, location_label, has_traffic, traffic, id],
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

    /// Corrects when a check-in was made (a UTC RFC 3339 time).
    pub fn set_checkin_time(&self, id: &str, at: &str) -> rusqlite::Result<()> {
        self.conn.execute("UPDATE checkins SET checked_in_at = ?1 WHERE id = ?2", params![at, id])?;
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
                AND coalesce(c.station_kind,'') <> 'net_control' \
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
            "UPDATE checkins SET location_lat = ?1, location_lon = ?2, location_label = ?3, location_manual = 1, location_how = 'pin' WHERE id = ?4",
            params![lat, lon, label, id],
        )?;
        Ok(())
    }

    pub fn clear_checkin_location(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE checkins SET location_lat = NULL, location_lon = NULL, location_label = NULL, location_manual = 0, location_how = '' WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    /// Puts a check-in on the map from an online lookup of `text`, unless it
    /// was placed by hand or its location isn't `text` any more (corrected
    /// while the lookup ran). Returns its activity when it was placed.
    #[allow(clippy::too_many_arguments)]
    pub fn place_checkin(
        &self,
        id: &str,
        text: &str,
        lat: f64,
        lon: f64,
        label: &str,
        grid: Option<&str>,
        how: &str,
    ) -> rusqlite::Result<Option<String>> {
        let row: Option<(String, String, String, bool)> = self
            .conn
            .query_row(
                "SELECT activity_id, coalesce(address,''), coalesce(qth_location,''), location_manual FROM checkins WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .ok();
        let Some((activity_id, address, qth, manual)) = row else { return Ok(None) };
        let t = text.trim();
        if manual || (address.trim() != t && qth.trim() != t) {
            return Ok(None);
        }
        self.conn.execute(
            "UPDATE checkins SET location_lat = ?1, location_lon = ?2, location_label = ?3, \
             grid_square = coalesce(?4, grid_square), location_how = ?5 WHERE id = ?6",
            params![lat, lon, label, grid, how, id],
        )?;
        Ok(Some(activity_id))
    }

    /// The same for a spotter report: placed unless its Location box changed.
    pub fn place_report(&self, id: &str, text: &str, lat: f64, lon: f64, how: &str) -> rusqlite::Result<Option<String>> {
        let row: Option<(String, String)> = self
            .conn
            .query_row(
                "SELECT activity_id, coalesce(location_text,'') FROM spotter_reports WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .ok();
        let Some((activity_id, location)) = row else { return Ok(None) };
        if location.trim() != text.trim() {
            return Ok(None);
        }
        self.conn.execute(
            "UPDATE spotter_reports SET lat = ?1, lon = ?2, location_how = ?3 WHERE id = ?4",
            params![lat, lon, how, id],
        )?;
        Ok(Some(activity_id))
    }

    /// Marks a check-in whose typed location the lookup after saving couldn't
    /// place (LOCRES-065): only while it's still not on the map and still
    /// holds that text. Returns its activity when it was marked.
    pub fn mark_checkin_not_found(&self, id: &str, text: &str) -> rusqlite::Result<Option<String>> {
        let t = text.trim();
        let marked = self.conn.execute(
            "UPDATE checkins SET location_how = 'not_found' WHERE id = ?1 AND location_lat IS NULL AND location_manual = 0 \
             AND (trim(coalesce(address,'')) = ?2 OR trim(coalesce(qth_location,'')) = ?2)",
            params![id, t],
        )?;
        if marked == 0 {
            return Ok(None);
        }
        self.conn
            .query_row("SELECT activity_id FROM checkins WHERE id = ?1", params![id], |r| r.get(0))
            .map(Some)
    }

    /// The same for a spotter report's Location box.
    pub fn mark_report_not_found(&self, id: &str, text: &str) -> rusqlite::Result<Option<String>> {
        let marked = self.conn.execute(
            "UPDATE spotter_reports SET location_how = 'not_found' WHERE id = ?1 AND lat IS NULL \
             AND trim(coalesce(location_text,'')) = ?2",
            params![id, text.trim()],
        )?;
        if marked == 0 {
            return Ok(None);
        }
        self.conn
            .query_row("SELECT activity_id FROM spotter_reports WHERE id = ?1", params![id], |r| r.get(0))
            .map(Some)
    }

    /// Records how a check-in's map point was arrived at (LOCRES-064).
    pub fn set_checkin_location_how(&self, id: &str, how: &str) -> rusqlite::Result<()> {
        self.conn.execute("UPDATE checkins SET location_how = ?1 WHERE id = ?2", params![how, id])?;
        Ok(())
    }

    /// The same for a spotter report.
    pub fn set_report_location_how(&self, id: &str, how: &str) -> rusqlite::Result<()> {
        self.conn.execute("UPDATE spotter_reports SET location_how = ?1 WHERE id = ?2", params![how, id])?;
        Ok(())
    }

    /// Records that a new check-in's location was placed by hand.
    pub fn mark_checkin_location_manual(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute("UPDATE checkins SET location_manual = 1 WHERE id = ?1", params![id])?;
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
        let mut stmt = self.conn.prepare("SELECT id, activity_id, coalesce(operator_id,''), reported_at, coalesce(county,''), coalesce(location_text,''), lat, lon, coalesce(reporter,''), hazard_type, coalesce(magnitude,''), coalesce(source,''), coalesce(notes,''), checkin_id, location_how FROM spotter_reports WHERE activity_id = ?1 AND voided_at IS NULL ORDER BY reported_at DESC")?;
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
        let mut stmt = self.conn.prepare("SELECT id, activity_id, coalesce(operator_id,''), reported_at, coalesce(county,''), coalesce(location_text,''), lat, lon, coalesce(reporter,''), hazard_type, coalesce(magnitude,''), coalesce(source,''), coalesce(notes,''), checkin_id, location_how FROM spotter_reports WHERE activity_id = ?1 AND voided_at IS NOT NULL ORDER BY voided_at DESC")?;
        let rows = stmt.query_map(params![activity_id], Self::map_spotter_report)?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        Ok(v)
    }

    pub fn get_spotter_report(&self, id: &str) -> rusqlite::Result<SpotterReport> {
        self.conn.query_row(
            "SELECT id, activity_id, coalesce(operator_id,''), reported_at, coalesce(county,''), coalesce(location_text,''), lat, lon, coalesce(reporter,''), hazard_type, coalesce(magnitude,''), coalesce(source,''), coalesce(notes,''), checkin_id, location_how FROM spotter_reports WHERE id = ?1",
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
            location_how: r.get(14)?,
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
        self.transition_activity_at(id, to, reason, conclusion, operator_id, None)
    }

    /// As `transition_activity`, with the end time given when closing (LIFE-008):
    /// a reopened net ended again needn't end "now". It must not be before the
    /// start or in the future.
    pub fn transition_activity_at(
        &self,
        id: &str,
        to: &str,
        reason: Option<&str>,
        conclusion: Option<&str>,
        operator_id: Option<&str>,
        ended_at: Option<&str>,
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
        let ended = match ended_at.map(str::trim).filter(|s| !s.is_empty()) {
            Some(v) if (from.as_str(), to) == ("active", "closed") => {
                let opened = self.get_activity(id).map_err(|e| e.to_string())?.opened_at;
                Some(Self::check_activity_times(&opened, Some(v), now)?.1.unwrap_or_else(|| stamp.clone()))
            }
            _ => None,
        };
        match (from.as_str(), to) {
            ("scheduled", "active") => self.conn.execute(
                "UPDATE activities SET state = 'active', opened_at = coalesce(opened_at, ?1) WHERE id = ?2",
                params![stamp, id],
            ),
            ("active", "closed") => self.conn.execute(
                "UPDATE activities SET state = 'closed', closed_at = ?1, conclusion = ?2 WHERE id = ?3",
                params![ended.as_deref().unwrap_or(&stamp), conclusion.map(str::trim).filter(|s| !s.is_empty()), id],
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

    /// Sets who runs a new activity, without touching its records.
    pub fn set_activity_operator(&self, id: &str, operator_id: Option<&str>) -> rusqlite::Result<()> {
        self.conn.execute("UPDATE activities SET operator_id = ?1 WHERE id = ?2", params![operator_id, id])?;
        Ok(())
    }

    /// Moves an activity to another operator (an activity run under the wrong
    /// call sign): the activity, and everything in it recorded by the previous
    /// operator — check-ins, spotter reports, relay messages and steps, and
    /// their history — now name the new one. One history event records the
    /// change.
    pub fn change_activity_operator(&self, id: &str, operator_id: &str) -> Result<(), String> {
        let a = self.get_activity(id).map_err(|_| "That activity no longer exists.".to_string())?;
        let known: bool = self
            .conn
            .query_row("SELECT EXISTS(SELECT 1 FROM operators WHERE id = ?1)", params![operator_id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if !known {
            return Err("That operator no longer exists.".into());
        }
        if a.operator_id == operator_id {
            return Ok(());
        }
        let old: Option<&str> = if a.operator_id.is_empty() { None } else { Some(&a.operator_id) };
        let tx = self.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        for sql in [
            "UPDATE checkins SET operator_id = ?1 WHERE activity_id = ?2 AND operator_id IS ?3",
            "UPDATE spotter_reports SET operator_id = ?1 WHERE activity_id = ?2 AND operator_id IS ?3",
            "UPDATE relay_messages SET operator_id = ?1 WHERE activity_id = ?2 AND operator_id IS ?3",
            "UPDATE relay_steps SET operator_id = ?1 WHERE operator_id IS ?3 \
                AND message_id IN (SELECT id FROM relay_messages WHERE activity_id = ?2)",
            "UPDATE audit_events SET operator_id = ?1 WHERE operator_id IS ?3 AND (entity_id = ?2 \
                OR entity_id IN (SELECT id FROM checkins WHERE activity_id = ?2) \
                OR entity_id IN (SELECT id FROM spotter_reports WHERE activity_id = ?2) \
                OR entity_id IN (SELECT id FROM relay_messages WHERE activity_id = ?2))",
        ] {
            tx.execute(sql, params![operator_id, id, old]).map_err(|e| e.to_string())?;
        }
        tx.execute("UPDATE activities SET operator_id = ?1 WHERE id = ?2", params![operator_id, id])
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        let data = serde_json::json!({ "from": old, "to": operator_id }).to_string();
        self.create_audit_event("activity", id, "change_operator", Some(&data), Some(operator_id))
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Checks a start and optional end time: readable, end after start, and
    /// neither in the future. Returns them as UTC RFC 3339.
    fn check_activity_times(
        opened_at: &str,
        closed_at: Option<&str>,
        now: DateTime<Utc>,
    ) -> Result<(String, Option<String>), String> {
        let read = |v: &str, what: &str| {
            DateTime::parse_from_rfc3339(v.trim())
                .map(|d| d.with_timezone(&Utc))
                .map_err(|_| format!("The {what} time isn't a valid date and time."))
        };
        // A minute's grace for clocks and typing "now".
        let latest = now + chrono::Duration::minutes(1);
        let start = read(opened_at, "start")?;
        if start > latest {
            return Err("The start time is in the future.".into());
        }
        let end = match closed_at {
            Some(v) => {
                let end = read(v, "end")?;
                if end > latest {
                    return Err("The end time is in the future.".into());
                }
                if end < start {
                    return Err("The end time is before the start.".into());
                }
                Some(end.to_rfc3339())
            }
            None => None,
        };
        Ok((start.to_rfc3339(), end))
    }

    /// Corrects when an activity started and, if it's closed, ended (LIFE-009),
    /// without reopening it. Recorded in the history with the old times.
    pub fn set_activity_times(
        &self,
        id: &str,
        opened_at: &str,
        closed_at: Option<&str>,
        operator_id: Option<&str>,
    ) -> Result<(), String> {
        let a = self.get_activity(id).map_err(|_| "That activity no longer exists.".to_string())?;
        if a.state == "scheduled" {
            return Err("This activity hasn't started yet, so it has no times to change.".into());
        }
        let closed_at = if a.state == "closed" {
            Some(closed_at.filter(|s| !s.trim().is_empty()).ok_or("Enter when it ended.")?)
        } else {
            None
        };
        let (start, end) = Self::check_activity_times(opened_at, closed_at, Utc::now())?;
        self.conn
            .execute(
                "UPDATE activities SET opened_at = ?1, closed_at = coalesce(?2, closed_at) WHERE id = ?3",
                params![start, end, id],
            )
            .map_err(|e| e.to_string())?;
        let data = serde_json::json!({
            "before": { "opened_at": a.opened_at, "closed_at": a.closed_at },
            "after": { "opened_at": start, "closed_at": end.as_deref().unwrap_or(&a.closed_at) },
        })
        .to_string();
        self.create_audit_event("activity", id, "correct_times", Some(&data), operator_id)
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
                &format!("SELECT MIN(checked_in_at), MAX(checked_in_at) FROM checkins WHERE activity_id = ?1 AND voided_at IS NULL AND {STATIONS_ONLY}"),
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
        let counties: Vec<CountyCount> = self
            .conn
            .prepare("SELECT trim(county), COUNT(*) FROM spotter_reports WHERE activity_id = ?1 AND voided_at IS NULL AND trim(coalesce(county,'')) <> '' GROUP BY trim(county) COLLATE NOCASE ORDER BY COUNT(*) DESC, trim(county)")
            .and_then(|mut st| {
                st.query_map(params![id], |r| Ok(CountyCount { county: r.get(0)?, count: r.get(1)? }))?
                    .collect()
            })
            .unwrap_or_default();
        // The biggest of a hazard's reports, by the number its magnitude starts with.
        let largest = |hazard: &str| -> String {
            let magnitudes: Vec<String> = self
                .conn
                .prepare("SELECT magnitude FROM spotter_reports WHERE activity_id = ?1 AND voided_at IS NULL AND hazard_type = ?2 AND magnitude IS NOT NULL")
                .and_then(|mut st| st.query_map(params![id, hazard], |r| r.get(0))?.collect())
                .unwrap_or_default();
            magnitudes
                .into_iter()
                .filter_map(|m| magnitude_size(&m).map(|n| (n, m)))
                .max_by(|a, b| a.0.total_cmp(&b.0))
                .map(|(_, m)| m)
                .unwrap_or_default()
        };
        Ok(ActivitySummary {
            state: a.state,
            opened_at: a.opened_at,
            closed_at: a.closed_at,
            conclusion: a.conclusion,
            checkins: one(&format!("SELECT COUNT(*) FROM checkins WHERE activity_id = ?1 AND voided_at IS NULL AND {STATIONS_ONLY}")),
            unique_stations: one(&format!(
                "SELECT COUNT(DISTINCT UPPER(call_sign)) FROM checkins WHERE activity_id = ?1 AND voided_at IS NULL AND {STATIONS_ONLY}"
            )),
            removed_checkins: one("SELECT COUNT(*) FROM checkins WHERE activity_id = ?1 AND voided_at IS NOT NULL"),
            first_checkin_at: first.unwrap_or_default(),
            last_checkin_at: last.unwrap_or_default(),
            hazards,
            spotter_reports: one("SELECT COUNT(*) FROM spotter_reports WHERE activity_id = ?1 AND voided_at IS NULL"),
            traffic_items: one(&format!(
                "SELECT COUNT(*) FROM checkins WHERE activity_id = ?1 AND voided_at IS NULL AND has_traffic = 1 AND {STATIONS_ONLY}"
            )),
            open_traffic_items: one(&format!(
                "SELECT COUNT(*) FROM checkins WHERE activity_id = ?1 AND voided_at IS NULL AND has_traffic = 1 AND traffic_handled = 0 AND {STATIONS_ONLY}"
            )),
            relay_messages: one("SELECT COUNT(*) FROM relay_messages WHERE activity_id = ?1 AND voided_at IS NULL"),
            held_relay_messages: one(&format!("SELECT COUNT(*) FROM relay_messages m WHERE m.activity_id = ?1 AND m.voided_at IS NULL AND NOT {RELAY_HAS_OUTCOME}")),
            unpassed_relay_messages: one(&format!("SELECT COUNT(*) FROM relay_messages m WHERE m.activity_id = ?1 AND m.voided_at IS NULL AND {RELAY_LAST_OUTCOME} = 'not_passed'")),
            weather: self.list_activity_weather(id).unwrap_or_default(),
            largest_hail: largest("Hail"),
            strongest_wind: largest("Wind Damage"),
            counties,
            alerts: self.list_activity_alerts(id).unwrap_or_default(),
        })
    }

    /// Attaches a copy of an NWS alert to an activity (SPOT-060). The same
    /// alert attached again is refused, so a double click doesn't list it twice.
    pub fn attach_activity_alert(&self, activity_id: &str, a: &ActivityAlert) -> Result<ActivityAlert, String> {
        if a.event.trim().is_empty() {
            return Err("That alert has no name.".to_string());
        }
        if !a.nws_id.is_empty() {
            let already: i64 = self
                .conn
                .query_row(
                    "SELECT COUNT(*) FROM activity_alerts WHERE activity_id = ?1 AND nws_id = ?2",
                    params![activity_id, a.nws_id],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if already > 0 {
                return Err("That alert is already attached.".to_string());
            }
        }
        let saved = ActivityAlert { id: Uuid::new_v4().to_string(), attached_at: Utc::now().to_rfc3339(), ..a.clone() };
        self.conn
            .execute(
                "INSERT INTO activity_alerts(id, activity_id, nws_id, event, headline, area_desc, severity, effective, ends, attached_at) \
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    saved.id,
                    activity_id,
                    saved.nws_id,
                    saved.event.trim(),
                    saved.headline,
                    saved.area_desc,
                    saved.severity,
                    saved.effective,
                    saved.ends,
                    saved.attached_at
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(saved)
    }

    /// Takes an attached alert off its activity, returning it and its activity's id.
    pub fn detach_activity_alert(&self, alert_id: &str) -> Result<(String, ActivityAlert), String> {
        let found = self
            .conn
            .query_row(
                &format!("SELECT activity_id, {ALERT_COLUMNS} FROM activity_alerts WHERE id = ?1"),
                params![alert_id],
                |r| Ok((r.get::<_, String>(0)?, Self::map_alert(r, 1)?)),
            )
            .map_err(|_| "That alert is no longer attached.".to_string())?;
        self.conn
            .execute("DELETE FROM activity_alerts WHERE id = ?1", params![alert_id])
            .map_err(|e| e.to_string())?;
        Ok(found)
    }

    pub fn list_activity_alerts(&self, activity_id: &str) -> rusqlite::Result<Vec<ActivityAlert>> {
        let mut st = self.conn.prepare(&format!(
            "SELECT {ALERT_COLUMNS} FROM activity_alerts WHERE activity_id = ?1 ORDER BY coalesce(nullif(effective,''), attached_at), attached_at"
        ))?;
        let rows = st.query_map(params![activity_id], |r| Self::map_alert(r, 0))?;
        rows.collect()
    }

    fn map_alert(r: &rusqlite::Row, from: usize) -> rusqlite::Result<ActivityAlert> {
        Ok(ActivityAlert {
            id: r.get(from)?,
            nws_id: r.get(from + 1)?,
            event: r.get(from + 2)?,
            headline: r.get(from + 3)?,
            area_desc: r.get(from + 4)?,
            severity: r.get(from + 5)?,
            effective: r.get(from + 6)?,
            ends: r.get(from + 7)?,
            attached_at: r.get(from + 8)?,
        })
    }

    /// Keeps the weather read as an activity started or ended, replacing an
    /// earlier one for the same moment (a net ended again after reopening).
    pub fn save_activity_weather(&self, activity_id: &str, w: &crate::weather::ActivityWeather) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO activity_weather(activity_id, moment, place, station_id, station_name, observed_at, \
                temp_c, conditions, wind_dir_deg, wind_speed_kmh, wind_gust_kmh, alerts, recorded_at, outcome) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![
                activity_id,
                w.moment,
                w.place,
                w.station_id,
                w.station_name,
                w.observed_at,
                w.temp_c,
                w.conditions,
                w.wind_dir_deg,
                w.wind_speed_kmh,
                w.wind_gust_kmh,
                w.alerts.join("\n"),
                Utc::now().to_rfc3339(),
                w.outcome,
            ],
        )?;
        Ok(())
    }

    pub fn list_activity_weather(&self, activity_id: &str) -> rusqlite::Result<Vec<crate::weather::ActivityWeather>> {
        let mut st = self.conn.prepare(
            "SELECT moment, place, station_id, station_name, observed_at, temp_c, conditions, wind_dir_deg, \
                wind_speed_kmh, wind_gust_kmh, alerts, outcome \
             FROM activity_weather WHERE activity_id = ?1 ORDER BY moment = 'end'",
        )?;
        let rows = st.query_map(params![activity_id], |r| {
            let alerts: String = r.get(10)?;
            Ok(crate::weather::ActivityWeather {
                moment: r.get(0)?,
                outcome: r.get(11)?,
                place: r.get(1)?,
                station_id: r.get(2)?,
                station_name: r.get(3)?,
                observed_at: r.get(4)?,
                temp_c: r.get(5)?,
                conditions: r.get(6)?,
                wind_dir_deg: r.get(7)?,
                wind_speed_kmh: r.get(8)?,
                wind_gust_kmh: r.get(9)?,
                alerts: alerts.lines().filter(|l| !l.is_empty()).map(String::from).collect(),
            })
        })?;
        rows.collect()
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
    pub fn activity_history(&self, activity_id: &str) -> rusqlite::Result<Vec<HistoryEntry>> {
        self.history(
            "e.entity_id = ?1 \
                OR e.entity_id IN (SELECT id FROM checkins WHERE activity_id = ?1) \
                OR e.entity_id IN (SELECT id FROM spotter_reports WHERE activity_id = ?1) \
                OR e.entity_id IN (SELECT id FROM relay_messages WHERE activity_id = ?1)",
            "ASC",
            -1,
            params![activity_id],
        )
    }

    /**
     * The History tab's lines, newest first (AUDIT-020): each event with what
     * it's about, named ("W4ABC", "Hail from W4ABC", "wrmr677 for Monroe"),
     * the activity it belongs to, and who did it. Something since deleted
     * has no name here; the event's own data still says what it was.
     */
    pub fn list_history(&self, limit: i64) -> rusqlite::Result<Vec<HistoryEntry>> {
        self.history("1", "DESC", limit, params![])
    }

    /// Audit events matching `filter` (SQL on `e`, the audit_events row), in
    /// time order `order` ("ASC" or "DESC"), at most `limit` (-1 for all),
    /// each named as `list_history` describes.
    fn history(&self, filter: &str, order: &str, limit: i64, args: impl rusqlite::Params) -> rusqlite::Result<Vec<HistoryEntry>> {
        let sql = format!(
            "WITH h AS (
                SELECT e.*, e.rowid AS seq, CASE e.entity_type
                    WHEN 'activity' THEN e.entity_id
                    WHEN 'checkin' THEN (SELECT activity_id FROM checkins WHERE id = e.entity_id)
                    WHEN 'spotter_report' THEN (SELECT activity_id FROM spotter_reports WHERE id = e.entity_id)
                    WHEN 'relay_message' THEN (SELECT activity_id FROM relay_messages WHERE id = e.entity_id)
                END AS activity_id
                FROM audit_events e WHERE {filter} ORDER BY e.created_at {order}, e.rowid {order} LIMIT {limit}
            )
            SELECT h.id, h.entity_type, h.entity_id, h.action, coalesce(h.data, ''),
                coalesce(o.display_name || CASE WHEN coalesce(o.call_sign, '') != '' THEN ' (' || o.call_sign || ')' ELSE '' END, ''),
                h.created_at,
                coalesce(CASE h.entity_type
                    WHEN 'activity' THEN (SELECT title FROM activities WHERE id = h.entity_id)
                    WHEN 'checkin' THEN (SELECT upper(call_sign) FROM checkins WHERE id = h.entity_id)
                    WHEN 'spotter_report' THEN (SELECT hazard_type || CASE WHEN coalesce(reporter, '') != '' THEN ' from ' || reporter ELSE '' END FROM spotter_reports WHERE id = h.entity_id)
                    WHEN 'relay_message' THEN (SELECT from_station || ' for ' || for_station FROM relay_messages WHERE id = h.entity_id)
                    WHEN 'operator' THEN (SELECT display_name || CASE WHEN coalesce(call_sign, '') != '' THEN ' (' || call_sign || ')' ELSE '' END FROM operators WHERE id = h.entity_id)
                    WHEN 'repeater' THEN (SELECT name FROM repeaters WHERE id = h.entity_id)
                    WHEN 'net_listing' THEN (SELECT name FROM net_listings WHERE id = h.entity_id)
                    WHEN 'place' THEN (SELECT name FROM places WHERE id = h.entity_id)
                    WHEN 'event' THEN (SELECT name FROM events WHERE id = h.entity_id)
                    WHEN 'ics214_log' THEN (SELECT incident_name FROM ics214_logs WHERE id = h.entity_id)
                END,
                -- Deleted from the directory: the name its deletion recorded.
                (SELECT json_extract(d.data, '$.before.name') FROM audit_events d
                 WHERE d.entity_type = h.entity_type AND d.entity_id = h.entity_id
                   AND d.action = 'delete' AND h.entity_type IN ('repeater', 'net_listing', 'place')
                 LIMIT 1), ''),
                coalesce(h.activity_id, ''),
                coalesce((SELECT title FROM activities WHERE id = h.activity_id), '')
             FROM h LEFT JOIN operators o ON o.id = h.operator_id
             ORDER BY h.created_at {order}, h.seq {order}"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(args, |r| {
            Ok(HistoryEntry {
                id: r.get(0)?,
                entity_type: r.get(1)?,
                entity_id: r.get(2)?,
                action: r.get(3)?,
                data: r.get(4)?,
                operator: r.get(5)?,
                created_at: r.get(6)?,
                subject: r.get(7)?,
                activity_id: r.get(8)?,
                activity_title: r.get(9)?,
            })
        })?;
        rows.collect()
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
    fn an_operator_can_be_corrected() {
        let r = repo();
        let pat = r.create_operator("Pat Jnoes", Some("K4NSC")).unwrap();
        r.update_operator(&pat, "Pat Jones", Some("K4NCS")).unwrap();
        let o = r.list_operators().unwrap().into_iter().find(|o| o.id == pat).unwrap();
        assert_eq!((o.display_name.as_str(), o.call_sign.as_str()), ("Pat Jones", "K4NCS"));
        assert!(r.update_operator("missing", "X", None).is_err());
    }

    #[test]
    fn history_keeps_the_name_of_a_deleted_repeater() {
        let r = repo();
        r.create_audit_event("repeater", "rpt1", "create", None, None).unwrap();
        r.create_audit_event("repeater", "rpt1", "retire", None, None).unwrap();
        r.create_audit_event("repeater", "rpt1", "delete", Some(r#"{"before":{"name":"W4ABC Orlando"}}"#), None)
            .unwrap();
        let subjects: Vec<_> = r.list_history(10).unwrap().into_iter().map(|e| e.subject).collect();
        assert_eq!(subjects, ["W4ABC Orlando"; 3]);
    }

    #[test]
    fn says_where_an_operator_is_named() {
        let r = repo();
        let pat = r.create_operator("Pat", Some("K4NCS")).unwrap();
        let usage = |r: &Repository| r.operator_usage(&pat).unwrap();
        // Their own retire/restore events don't count.
        r.create_audit_event("operator", &pat, "retire", None, Some(&pat)).unwrap();
        assert!(usage(&r).activities.is_empty() && usage(&r).other_history.is_empty());
        assert!(!r.operator_has_records(&pat).unwrap());

        let net = r.create_activity("Tuesday net", "directed_net", None, None).unwrap();
        r.set_activity_operator(&net, Some(&pat)).unwrap();
        let other = r.create_activity("SKYWARN", "skywarn", None, None).unwrap();
        r.create_checkin(&other, "W1AW", None, None, None, None, Some(&pat), None, None, None, false, None, &ContactDetails::default())
            .unwrap();
        r.create_activity("Someone else's", "simple_net", None, None).unwrap();
        r.create_audit_event("repeater", "rpt1", "create", None, Some(&pat)).unwrap();

        let u = usage(&r);
        let titles: Vec<_> = u.activities.iter().map(|a| (a.title.as_str(), a.runs, a.checkins)).collect();
        assert!(titles.contains(&("Tuesday net", true, 0)));
        assert!(titles.contains(&("SKYWARN", false, 1)));
        assert_eq!(u.activities.len(), 2);
        assert_eq!(u.other_history, vec![HistoryKindCount { kind: "repeater".into(), count: 1 }]);
        assert!(r.operator_has_records(&pat).unwrap());
    }

    #[test]
    fn an_activity_and_its_records_move_to_another_operator() {
        let r = repo();
        let gmrs = r.create_operator("Pat", Some("WRAB123")).unwrap();
        let ham = r.create_operator("Pat", Some("K4NCS")).unwrap();
        let a = r.create_activity("Ham net", "directed_net", None, None).unwrap();
        r.set_activity_operator(&a, Some(&gmrs)).unwrap();
        r.transition_activity(&a, "active", None, None, Some(&gmrs)).unwrap();
        let c = r
            .create_checkin(&a, "W1AW", None, None, None, None, Some(&gmrs), None, None, None, false, None, &ContactDetails::default())
            .unwrap();
        let other = r.create_activity("GMRS net", "simple_net", None, None).unwrap();
        let kept = r
            .create_checkin(&other, "WRXX999", None, None, None, None, Some(&gmrs), None, None, None, false, None, &ContactDetails::default())
            .unwrap();

        r.change_activity_operator(&a, &ham).unwrap();
        assert_eq!(r.get_activity(&a).unwrap().operator_id, ham);
        let op_of = |sql: &str, id: &str| -> String { r.conn.query_row(sql, params![id], |row| row.get(0)).unwrap() };
        assert_eq!(op_of("SELECT operator_id FROM checkins WHERE id = ?1", &c), ham);
        assert_eq!(op_of("SELECT operator_id FROM checkins WHERE id = ?1", &kept), gmrs, "other activities untouched");
        let history = r.activity_history(&a).unwrap();
        assert!(history.iter().all(|e| !e.operator.contains("WRAB123")));
        assert!(history.iter().any(|e| e.action == "change_operator"));
        assert!(r.change_activity_operator(&a, "nobody").is_err());

        // Existing activities are given the operator who recorded most of them.
        r.conn.execute("UPDATE activities SET operator_id = NULL", []).unwrap();
        let sql = include_str!("../migrations/0028_activity_operator.sql");
        r.conn.execute_batch(&sql[sql.find("UPDATE").unwrap()..]).unwrap();
        assert_eq!(r.get_activity(&a).unwrap().operator_id, ham);
        assert_eq!(r.get_activity(&other).unwrap().operator_id, gmrs);
        assert!(r.operator_has_records(&ham).unwrap());
    }

    #[test]
    fn a_net_can_end_at_a_given_time_and_its_times_be_corrected() {
        let r = repo();
        let a = r.create_activity("Net", "directed_net", None, None).unwrap();
        assert!(r.set_activity_times(&a, "2026-10-04T00:00:00Z", None, None).unwrap_err().contains("hasn't started"));
        r.transition_activity(&a, "active", None, None, None).unwrap();
        let opened = r.get_activity(&a).unwrap().opened_at;

        // A reopened net ended again keeps an earlier end time.
        let before_start = "2000-01-01T00:00:00Z";
        assert!(r.transition_activity_at(&a, "closed", None, None, None, Some(before_start)).unwrap_err().contains("before the start"));
        assert!(r.transition_activity_at(&a, "closed", None, None, None, Some("2999-01-01T00:00:00Z")).unwrap_err().contains("future"));
        r.transition_activity_at(&a, "closed", None, None, None, Some(&opened)).unwrap();
        assert_eq!(r.get_activity(&a).unwrap().closed_at, opened);

        // Corrected without reopening, and recorded.
        r.set_activity_times(&a, "2026-10-03T23:00:00-04:00", Some("2026-10-04T04:15:00Z"), None).unwrap();
        let fixed = r.get_activity(&a).unwrap();
        assert_eq!((fixed.state.as_str(), fixed.opened_at.as_str(), fixed.closed_at.as_str()), ("closed", "2026-10-04T03:00:00+00:00", "2026-10-04T04:15:00+00:00"));
        assert!(r.set_activity_times(&a, "2026-10-04T03:00:00Z", None, None).unwrap_err().contains("ended"));
        assert!(r.set_activity_times(&a, "2026-10-04T05:00:00Z", Some("2026-10-04T04:15:00Z"), None).is_err());
        assert!(r.activity_history(&a).unwrap().iter().any(|e| e.action == "correct_times"));
    }

    #[test]
    fn a_location_set_by_hand_is_marked_and_clearing_resets_it() {
        let r = repo();
        let a = r.create_activity("Net", "directed_net", None, None).unwrap();
        let c = r
            .create_checkin(&a, "K4ABC", None, None, None, Some("33157"), None, Some(25.6), Some(-80.3), None, false, None, &ContactDetails::default())
            .unwrap();
        let manual = |r: &Repository| r.get_checkin(&c).unwrap().location_manual;
        assert!(!manual(&r), "worked out from the address");
        r.set_checkin_location_coords(&c, 25.7, -80.2, Some("Home")).unwrap();
        assert!(manual(&r), "picked on the map");
        r.clear_checkin_location(&c).unwrap();
        assert!(!manual(&r));
        r.mark_checkin_location_manual(&c).unwrap();
        assert!(manual(&r));
    }

    #[test]
    fn keeps_the_weather_at_start_and_end_and_deletes_it_with_the_activity() {
        let r = repo();
        let id = r.create_activity("Net", "directed_net", None, None).unwrap();
        assert!(r.activity_summary(&id).unwrap().weather.is_empty());

        let w = |moment: &str, conditions: &str| crate::weather::ActivityWeather {
            moment: moment.into(),
            outcome: "ok".into(),
            place: "repeater".into(),
            station_id: "KORL".into(),
            station_name: "Orlando Executive Airport".into(),
            observed_at: "2026-10-05T23:15:00+00:00".into(),
            temp_c: Some(26.0),
            conditions: conditions.into(),
            wind_dir_deg: Some(180.0),
            wind_speed_kmh: Some(24.1),
            wind_gust_kmh: None,
            alerts: vec!["Severe Thunderstorm Warning".into(), "Flood Watch".into()],
        };
        r.save_activity_weather(&id, &crate::weather::without_reading("end", "offline")).unwrap();
        assert_eq!(r.activity_summary(&id).unwrap().weather[0].outcome, "offline");
        r.save_activity_weather(&id, &w("start", "Thunderstorms")).unwrap();
        // Ended again after reopening: the new reading replaces the old.
        r.save_activity_weather(&id, &w("end", "Cloudy")).unwrap();
        let got = r.activity_summary(&id).unwrap().weather;
        assert_eq!(got, vec![w("start", "Thunderstorms"), w("end", "Cloudy")]);

        r.delete_activity_permanently(&id, None).unwrap();
        let left: i64 = r.conn.query_row("SELECT COUNT(*) FROM activity_weather", [], |x| x.get(0)).unwrap();
        assert_eq!(left, 0);
    }

    #[test]
    fn walks_the_lifecycle_and_records_each_step() {
        let r = repo();
        let id = r.create_activity("Net", "directed_net", Some("2026-09-21"), None).unwrap();
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
        let id = r.create_activity("Net", "directed_net", None, None).unwrap();
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
    fn history_names_what_each_event_is_about() {
        let r = repo();
        let id = r.create_activity("Tuesday Net", "directed_net", None, None).unwrap();
        r.transition_activity(&id, "active", None, None, None).unwrap();
        let c = r.create_checkin(&id, "w4abc", None, None, None, None, None, None, None, None, false, None, &ContactDetails::default()).unwrap();
        r.create_audit_event("checkin", &c, "traffic_handled", Some("{\"handled\":true}"), None).unwrap();
        let gone = r.create_activity("Test run", "simple_net", None, None).unwrap();
        r.delete_activity_permanently(&gone, None).unwrap();

        let h = r.list_history(10).unwrap();
        // Newest first.
        assert_eq!(h[0].action, "delete_permanently");
        assert_eq!(h[0].subject, "", "deleted, so only its data names it");
        assert!(h[0].data.contains("Test run"));
        let handled = h.iter().find(|e| e.action == "traffic_handled").unwrap();
        assert_eq!((handled.subject.as_str(), handled.activity_title.as_str()), ("W4ABC", "Tuesday Net"));
        assert_eq!(handled.activity_id, id);
        let started = h.iter().find(|e| e.action == "started").unwrap();
        assert_eq!((started.subject.as_str(), started.activity_title.as_str()), ("Tuesday Net", "Tuesday Net"));
        assert_eq!(r.list_history(1).unwrap().len(), 1);

        // An activity's own history is named the same way, oldest first, and only its own.
        let own = r.activity_history(&id).unwrap();
        assert_eq!(own.iter().map(|e| e.action.as_str()).collect::<Vec<_>>(), ["started", "traffic_handled"]);
        assert_eq!(own[1].subject, "W4ABC");
    }

    #[test]
    fn summary_counts_what_happened() {
        let r = repo();
        let id = r.create_activity("Net", "directed_net", None, None).unwrap();
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
        // The Activities table's count leaves out the removed one too (UX-OPS-015).
        assert_eq!(r.get_activity(&id).unwrap().record_count, 5);
        assert_eq!(r.list_activities().unwrap().iter().find(|a| a.id == id).unwrap().record_count, 5);
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

    #[test]
    fn net_control_notes_are_not_check_ins_stations_or_traffic() {
        let r = repo();
        let id = r.create_activity("Net", "directed_net", None, None).unwrap();
        let none = ContactDetails::default();
        let ncs = ContactDetails { station_kind: Some("net_control".into()), ..Default::default() };
        r.create_checkin(&id, "W4ABC", None, None, None, None, None, None, None, None, true, Some("Hail"), &none).unwrap();
        r.create_checkin(&id, "W0LAB", None, None, None, None, None, None, None, None, false, Some("Tornado warning issued"), &ncs)
            .unwrap();
        r.create_checkin(&id, "W0LAB", None, None, None, None, None, None, None, None, false, Some("Switched to backup repeater"), &ncs)
            .unwrap();
        let s = r.activity_summary(&id).unwrap();
        assert_eq!((s.checkins, s.unique_stations, s.traffic_items, s.open_traffic_items), (1, 1, 1, 1));
        assert_eq!(r.list_checkins(&id).unwrap().len(), 3, "they're still on the roster");
        assert_eq!(r.list_activities().unwrap().into_iter().find(|a| a.id == id).unwrap().record_count, 1);
        assert_eq!(r.station_history("W0LAB").unwrap().count, 0, "net control's notes aren't contacts");
        // The note's text is kept, though it isn't traffic, and stays when corrected.
        let note = r.list_checkins(&id).unwrap().into_iter().find(|c| c.traffic == "Switched to backup repeater").unwrap();
        assert!(!note.has_traffic);
        r.update_checkin(&note.id, "W0LAB", None, None, None, None, None, None, None, false, Some("Back on the main repeater"), None)
            .unwrap();
        assert_eq!(r.get_checkin(&note.id).unwrap().traffic, "Back on the main repeater");
        // A station's traffic still goes when it's cleared.
        let hail = r.list_checkins(&id).unwrap().into_iter().find(|c| c.traffic == "Hail").unwrap();
        r.update_checkin(&hail.id, "W4ABC", None, None, None, None, None, None, None, false, Some("Hail"), None).unwrap();
        assert_eq!(r.get_checkin(&hail.id).unwrap().traffic, "");
    }

    #[test]
    fn a_lookup_that_finds_nothing_says_so_only_while_it_still_applies() {
        let r = repo();
        let id = r.create_activity("Net", "skywarn", None, None).unwrap();
        let typed = "behind the old mill";
        let none = ContactDetails::default();
        let c = r.create_checkin(&id, "W4ABC", None, None, None, Some(typed), None, None, None, None, false, None, &none).unwrap();
        assert_eq!(r.mark_checkin_not_found(&c, typed).unwrap(), Some(id.clone()));
        assert_eq!(r.get_checkin(&c).unwrap().location_how, "not_found");
        // Already on the map (a ZIP's centre, say), or its text changed: left alone.
        let placed = r
            .create_checkin(&id, "W4XYZ", None, None, None, Some(typed), None, Some(25.6), Some(-80.4), None, false, None, &none)
            .unwrap();
        assert_eq!(r.mark_checkin_not_found(&placed, typed).unwrap(), None);
        assert_eq!(r.mark_checkin_not_found(&c, "somewhere else").unwrap(), None);
        // Placed by hand later: the pin wins.
        r.set_checkin_location_coords(&c, 25.7, -80.2, None).unwrap();
        assert_eq!(r.get_checkin(&c).unwrap().location_how, "pin");
        assert_eq!(r.mark_checkin_not_found(&c, typed).unwrap(), None);

        let rep = r
            .create_spotter_report(&id, "2026-01-01T12:00", None, Some(typed), None, None, None, "Hail", None, None, None, None, None)
            .unwrap();
        assert_eq!(r.mark_report_not_found(&rep, typed).unwrap(), Some(id));
        assert_eq!(r.get_spotter_report(&rep).unwrap().location_how, "not_found");
        assert_eq!(r.mark_report_not_found(&rep, "elsewhere").unwrap(), None);
    }

    #[test]
    fn a_lookup_places_only_what_still_needs_it() {
        let r = repo();
        let id = r.create_activity("Net", "skywarn", None, None).unwrap();
        let typed = "sw 152 st & sw 137 ave";
        let c = r
            .create_checkin(&id, "W4ABC", None, None, Some("EL95"), Some(typed), None, None, None, None, false, None, &ContactDetails::default())
            .unwrap();
        assert_eq!(r.place_checkin(&c, typed, 25.6262, -80.4145, typed, Some("EL95tp"), "crossing").unwrap(), Some(id.clone()));
        let got = r.get_checkin(&c).unwrap();
        assert_eq!((got.location_lat, got.location_lon, got.grid_square.as_str()), (Some(25.6262), Some(-80.4145), "EL95tp"));
        assert!(!got.location_manual, "a lookup isn't placing by hand");
        assert_eq!(got.location_how, "crossing", "how it was placed is kept (LOCRES-064)");
        // A grid square from a call-sign lookup stays.
        r.place_checkin(&c, typed, 25.0, -80.0, typed, None, "crossing").unwrap();
        assert_eq!(r.get_checkin(&c).unwrap().grid_square, "EL95tp");
        // Corrected while the lookup ran, or placed by hand: left alone.
        assert_eq!(r.place_checkin(&c, "somewhere else", 1.0, 1.0, "x", None, "crossing").unwrap(), None);
        r.set_checkin_location_coords(&c, 25.7, -80.2, Some("pin")).unwrap();
        assert_eq!(r.place_checkin(&c, typed, 1.0, 1.0, "x", None, "crossing").unwrap(), None);
        assert_eq!(r.get_checkin(&c).unwrap().location_lat, Some(25.7));
        assert_eq!(r.get_checkin(&c).unwrap().location_how, "pin");
        r.clear_checkin_location(&c).unwrap();
        assert_eq!(r.get_checkin(&c).unwrap().location_how, "");

        let rep = r
            .create_spotter_report(&id, "2026-01-01T12:00", None, Some(typed), None, None, None, "Hail", None, None, None, None, None)
            .unwrap();
        assert_eq!(r.place_report(&rep, typed, 25.6, -80.4, "crossing").unwrap(), Some(id.clone()));
        assert_eq!(r.get_spotter_report(&rep).unwrap().lat, Some(25.6));
        assert_eq!(r.get_spotter_report(&rep).unwrap().location_how, "crossing");
        r.set_report_location_how(&rep, "zip").unwrap();
        assert_eq!(r.list_spotter_reports(&id).unwrap()[0].location_how, "zip");
        assert_eq!(r.place_report(&rep, "elsewhere", 1.0, 1.0, "crossing").unwrap(), None);
        assert_eq!(r.place_checkin("missing", typed, 1.0, 1.0, "x", None, "crossing").unwrap(), None);
    }

    #[test]
    fn summary_gives_the_largest_hail_strongest_wind_and_reports_by_county() {
        let r = repo();
        let id = r.create_activity("Storm Net", "skywarn", None, None).unwrap();
        let s = r.activity_summary(&id).unwrap();
        assert_eq!((s.largest_hail.as_str(), s.strongest_wind.as_str()), ("", ""));
        assert!(s.counties.is_empty());

        let report = |hazard: &str, magnitude: Option<&str>, county: Option<&str>| {
            r.create_spotter_report(&id, "2026-01-01T12:00", county, None, None, None, None, hazard, magnitude, None, None, None, None)
                .unwrap()
        };
        report("Hail", Some("0.75 in (Penny)"), Some("Orange"));
        report("Hail", Some("1.75 in (Golf Ball)"), Some("orange "));
        report("Hail", Some("about the size of a pea"), Some("Seminole"));
        let gone = report("Hail", Some("4.50 in (Grapefruit)"), Some("Lake"));
        r.void_spotter_report(&gone, None).unwrap();
        report("Wind Damage", Some("58-73 mph (Severe Storm) — Severe threshold"), None);
        report("Wind Damage", Some("90+ mph (Destructive Wind)"), Some(""));
        report("Wind Damage", Some("8-12 mph (Gentle Breeze)"), Some("Seminole"));
        report("Tornado", Some("Funnel cloud (no ground contact)"), Some("Orange"));

        let s = r.activity_summary(&id).unwrap();
        assert_eq!(s.largest_hail, "1.75 in (Golf Ball)", "a removed report doesn't count");
        assert_eq!(s.strongest_wind, "90+ mph (Destructive Wind)");
        let counties: Vec<_> = s.counties.iter().map(|c| (c.county.to_lowercase(), c.count)).collect();
        assert_eq!(counties, [("orange".to_string(), 3), ("seminole".to_string(), 2)]);
    }

    #[test]
    fn alerts_are_attached_once_removed_and_deleted_with_the_activity() {
        let r = repo();
        let id = r.create_activity("Storm Net", "skywarn", None, None).unwrap();
        let warning = ActivityAlert {
            nws_id: "urn:oid:2.49.0.1.840.0.abc".into(),
            event: "Tornado Warning".into(),
            area_desc: "Orange, FL; Seminole, FL".into(),
            effective: "2026-10-05T23:30:00+00:00".into(),
            ends: "2026-10-06T00:15:00+00:00".into(),
            ..Default::default()
        };
        let watch = ActivityAlert {
            nws_id: "urn:oid:2.49.0.1.840.0.def".into(),
            event: "Tornado Watch".into(),
            effective: "2026-10-05T20:00:00+00:00".into(),
            ..Default::default()
        };
        let w = r.attach_activity_alert(&id, &warning).unwrap();
        r.attach_activity_alert(&id, &watch).unwrap();
        assert!(r.attach_activity_alert(&id, &warning).unwrap_err().contains("already attached"));
        assert!(r.attach_activity_alert(&id, &ActivityAlert::default()).is_err(), "an alert needs a name");

        let events: Vec<_> = r.activity_summary(&id).unwrap().alerts.into_iter().map(|a| a.event).collect();
        assert_eq!(events, ["Tornado Watch", "Tornado Warning"], "in the order they took effect");

        let (from, removed) = r.detach_activity_alert(&w.id).unwrap();
        assert_eq!((from.as_str(), removed.event.as_str()), (id.as_str(), "Tornado Warning"));
        assert!(r.detach_activity_alert(&w.id).is_err());
        assert_eq!(r.list_activity_alerts(&id).unwrap().len(), 1);

        r.delete_activity_permanently(&id, None).unwrap();
        let left: i64 = r.conn.query_row("SELECT COUNT(*) FROM activity_alerts", [], |x| x.get(0)).unwrap();
        assert_eq!(left, 0);
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
        assert_eq!(r.activity_contents(&a).unwrap(), DeletedCounts { checkins: 2, spotter_reports: 1, relay_messages: 0 });
    }

    #[test]
    fn deleting_an_activity_erases_it_and_everything_recorded_on_it() {
        let r = repo();
        let op = r.create_operator("Pat", Some("K8ABC")).unwrap();
        let (a, c, s) = populated(&r, &op);
        let other = r.create_activity("Other Net", "simple_net", None, None).unwrap();
        let kept = r.create_checkin(&other, "N0KEEP", None, None, None, None, Some(&op), None, None, None, false, None, &ContactDetails::default()).unwrap();

        let counts = r.delete_activity_permanently(&a, Some(&op)).unwrap();
        assert_eq!(counts, DeletedCounts { checkins: 2, spotter_reports: 1, relay_messages: 0 });

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
