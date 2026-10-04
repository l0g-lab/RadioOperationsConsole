//! Relay station (docs/features/relay-station.md): messages received from one
//! station to pass on to another, and each step in passing them on — a
//! failed attempt, passing it, or giving up. Whether a message is still held
//! follows from its steps.

use crate::repo::Repository;
use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// What's entered for a message as it comes in (RELAY-010).
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Default)]
pub struct RelayMessageInput {
    /// RFC 3339.
    pub received_at: String,
    pub from_station: String,
    pub for_station: String,
    pub message: String,
    /// The frequency, repeater, or other means it came in on.
    #[serde(default)]
    pub received_via: String,
    /// The message this answers (RELAY-030).
    #[serde(default)]
    pub reply_to: Option<String>,
}

/// What's entered for a step in passing a message on (RELAY-020).
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Default)]
pub struct RelayStepInput {
    /// "attempt", "passed", or "not_passed".
    pub kind: String,
    /// RFC 3339.
    pub at: String,
    #[serde(default)]
    pub station: String,
    #[serde(default)]
    pub via: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct RelayStep {
    pub id: String,
    pub kind: String,
    pub at: String,
    pub station: String,
    pub via: String,
    pub note: String,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct RelayMessage {
    pub id: String,
    pub activity_id: String,
    pub received_at: String,
    pub from_station: String,
    pub for_station: String,
    pub message: String,
    pub received_via: String,
    pub reply_to: Option<String>,
    /// "held", "passed", or "not_passed".
    pub status: String,
    /// Oldest first; undone steps are left out.
    pub steps: Vec<RelayStep>,
    pub voided_at: String,
    pub void_reason: String,
}

pub const STEP_KINDS: [&str; 3] = ["attempt", "passed", "not_passed"];

fn instant(v: &str, what: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(v.trim())
        .map(|d| d.with_timezone(&Utc))
        .map_err(|_| format!("The {what} isn't a valid date and time."))
}

/// Checks and tidies a message as entered (RELAY-010).
pub fn clean_message(mut m: RelayMessageInput) -> Result<RelayMessageInput, String> {
    for text in [&mut m.from_station, &mut m.for_station, &mut m.message, &mut m.received_via] {
        *text = text.trim().to_string();
    }
    m.received_at = instant(&m.received_at, "time received")?.to_rfc3339();
    if m.from_station.is_empty() {
        return Err("Who did the message come from?".into());
    }
    if m.for_station.is_empty() {
        return Err("Who is the message for?".into());
    }
    if m.message.is_empty() {
        return Err("Enter the message, or a summary of it.".into());
    }
    m.reply_to = m.reply_to.filter(|r| !r.trim().is_empty());
    Ok(m)
}

/// Checks and tidies a step as entered (RELAY-020–022). `received_at` is
/// the message's, which the step can't come before.
pub fn clean_step(mut s: RelayStepInput, received_at: &str) -> Result<RelayStepInput, String> {
    for text in [&mut s.kind, &mut s.station, &mut s.via, &mut s.note] {
        *text = text.trim().to_string();
    }
    if !STEP_KINDS.contains(&s.kind.as_str()) {
        return Err(format!("Unknown relay step \"{}\".", s.kind));
    }
    let at = instant(&s.at, "time")?;
    if let Ok(received) = instant(received_at, "time received") {
        if at < received {
            return Err("That's before the message was received.".into());
        }
    }
    s.at = at.to_rfc3339();
    match s.kind.as_str() {
        "attempt" if s.via.is_empty() => Err("How did you try to pass it? A frequency, repeater, or other means.".into()),
        "passed" if s.station.is_empty() => Err("Who did you pass it to?".into()),
        "passed" if s.via.is_empty() => Err("How was it passed? A frequency, repeater, or other means.".into()),
        "not_passed" if s.note.is_empty() => Err("Say why it couldn't be passed.".into()),
        _ => Ok(s),
    }
}

/// A message's status from its steps: the outcome, if there is one.
pub fn status_of(steps: &[RelayStep]) -> &'static str {
    match steps.iter().rev().find(|s| s.kind != "attempt").map(|s| s.kind.as_str()) {
        Some("passed") => "passed",
        Some("not_passed") => "not_passed",
        _ => "held",
    }
}

const MESSAGE_COLS: &str = "id, activity_id, received_at, from_station, for_station, message, coalesce(received_via,''), reply_to, coalesce(voided_at,''), coalesce(void_reason,'')";

fn blank(s: &str) -> Option<&str> {
    if s.is_empty() { None } else { Some(s) }
}

impl Repository {
    fn relay_steps(&self, message_id: &str) -> rusqlite::Result<Vec<RelayStep>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, kind, at, coalesce(station,''), coalesce(via,''), coalesce(note,'') \
             FROM relay_steps WHERE message_id = ?1 AND voided_at IS NULL ORDER BY at, rowid",
        )?;
        let rows = stmt.query_map(params![message_id], |r| {
            Ok(RelayStep { id: r.get(0)?, kind: r.get(1)?, at: r.get(2)?, station: r.get(3)?, via: r.get(4)?, note: r.get(5)? })
        })?;
        rows.collect()
    }

    fn relay_messages_where(&self, filter: &str, arg: &str) -> rusqlite::Result<Vec<RelayMessage>> {
        let mut stmt = self
            .conn
            .prepare(&format!("SELECT {MESSAGE_COLS} FROM relay_messages WHERE {filter} ORDER BY received_at, rowid"))?;
        let rows: Vec<RelayMessage> = stmt
            .query_map(params![arg], |r| {
                Ok(RelayMessage {
                    id: r.get(0)?,
                    activity_id: r.get(1)?,
                    received_at: r.get(2)?,
                    from_station: r.get(3)?,
                    for_station: r.get(4)?,
                    message: r.get(5)?,
                    received_via: r.get(6)?,
                    reply_to: r.get(7)?,
                    status: String::new(),
                    steps: Vec::new(),
                    voided_at: r.get(8)?,
                    void_reason: r.get(9)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        rows.into_iter()
            .map(|mut m| {
                m.steps = self.relay_steps(&m.id)?;
                m.status = status_of(&m.steps).to_string();
                Ok(m)
            })
            .collect()
    }

    /// An activity's messages, oldest first.
    pub fn list_relay_messages(&self, activity_id: &str) -> rusqlite::Result<Vec<RelayMessage>> {
        self.relay_messages_where("activity_id = ?1 AND voided_at IS NULL", activity_id)
    }

    /// An activity's removed messages, which can be restored.
    pub fn list_removed_relay_messages(&self, activity_id: &str) -> rusqlite::Result<Vec<RelayMessage>> {
        self.relay_messages_where("activity_id = ?1 AND voided_at IS NOT NULL", activity_id)
    }

    pub fn get_relay_message(&self, id: &str) -> rusqlite::Result<RelayMessage> {
        self.relay_messages_where("id = ?1", id)?
            .pop()
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn activity_id_of_relay_message(&self, id: &str) -> Option<String> {
        self.conn
            .query_row("SELECT activity_id FROM relay_messages WHERE id = ?1", params![id], |r| r.get(0))
            .ok()
    }

    pub fn message_id_of_relay_step(&self, id: &str) -> Option<String> {
        self.conn
            .query_row("SELECT message_id FROM relay_steps WHERE id = ?1", params![id], |r| r.get(0))
            .ok()
    }

    /// A reply must answer a message of the same activity.
    fn check_reply_to(&self, activity_id: &str, m: &RelayMessageInput, own_id: Option<&str>) -> Result<(), String> {
        let Some(r) = m.reply_to.as_deref() else { return Ok(()) };
        if Some(r) == own_id {
            return Err("A message can't answer itself.".into());
        }
        let found: Option<String> = self
            .conn
            .query_row("SELECT activity_id FROM relay_messages WHERE id = ?1", params![r], |row| row.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        match found {
            Some(a) if a == activity_id => Ok(()),
            _ => Err("The message this replies to isn't in this activity.".into()),
        }
    }

    /// Logs a message as it comes in (already checked with `clean_message`).
    pub fn create_relay_message(&self, activity_id: &str, m: &RelayMessageInput, operator_id: Option<&str>) -> Result<String, String> {
        self.check_reply_to(activity_id, m, None)?;
        let id = Uuid::new_v4().to_string();
        self.conn
            .execute(
                "INSERT INTO relay_messages(id, activity_id, operator_id, received_at, from_station, for_station, message, received_via, reply_to, created_at) \
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![id, activity_id, operator_id, m.received_at, m.from_station, m.for_station, m.message, blank(&m.received_via), m.reply_to, Utc::now().to_rfc3339()],
            )
            .map_err(|e| e.to_string())?;
        Ok(id)
    }

    /// Corrects what was logged when it came in (already checked).
    pub fn update_relay_message(&self, id: &str, m: &RelayMessageInput) -> Result<(), String> {
        let activity_id = self.activity_id_of_relay_message(id).ok_or("That message no longer exists.")?;
        self.check_reply_to(&activity_id, m, Some(id))?;
        self.conn
            .execute(
                "UPDATE relay_messages SET received_at = ?1, from_station = ?2, for_station = ?3, message = ?4, received_via = ?5, reply_to = ?6 WHERE id = ?7",
                params![m.received_at, m.from_station, m.for_station, m.message, blank(&m.received_via), m.reply_to, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Records a step (already checked with `clean_step`). Once a message is
    /// passed or given up on, the outcome must be undone before another step.
    pub fn add_relay_step(&self, message_id: &str, s: &RelayStepInput, operator_id: Option<&str>) -> Result<String, String> {
        let steps = self.relay_steps(message_id).map_err(|e| e.to_string())?;
        match status_of(&steps) {
            "passed" => return Err("This message was already passed. Undo that first to change it.".into()),
            "not_passed" => return Err("This message was marked as not passed. Undo that first to change it.".into()),
            _ => {}
        }
        let id = Uuid::new_v4().to_string();
        self.conn
            .execute(
                "INSERT INTO relay_steps(id, message_id, operator_id, kind, at, station, via, note, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![id, message_id, operator_id, s.kind, s.at, blank(&s.station), blank(&s.via), blank(&s.note), Utc::now().to_rfc3339()],
            )
            .map_err(|e| e.to_string())?;
        Ok(id)
    }

    /// Takes back a step recorded by mistake; it stays in the database, out of the log.
    pub fn undo_relay_step(&self, step_id: &str) -> rusqlite::Result<()> {
        let n = self.conn.execute(
            "UPDATE relay_steps SET voided_at = ?1 WHERE id = ?2 AND voided_at IS NULL",
            params![Utc::now().to_rfc3339(), step_id],
        )?;
        if n == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn void_relay_message(&self, id: &str, reason: Option<&str>) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE relay_messages SET voided_at = ?1, void_reason = ?2 WHERE id = ?3",
            params![Utc::now().to_rfc3339(), reason, id],
        )?;
        Ok(())
    }

    pub fn restore_relay_message(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE relay_messages SET voided_at = NULL, void_reason = NULL WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo_with_activity() -> (Repository, String) {
        let path = std::env::temp_dir().join(format!("roc-relay-{}.db", Uuid::new_v4()));
        let r = Repository::new(crate::db::open_db(&path).unwrap());
        let a = r.create_activity("SET relay", "relay", None, None).unwrap();
        (r, a)
    }

    fn sitrep() -> RelayMessageInput {
        RelayMessageInput {
            received_at: "2026-10-03T10:00:00-04:00".into(),
            from_station: " Shelter 2 ".into(),
            for_station: "EOC".into(),
            message: "40 occupants, need cots".into(),
            received_via: "146.940".into(),
            reply_to: None,
        }
    }

    fn step(kind: &str, at: &str) -> RelayStepInput {
        RelayStepInput { kind: kind.into(), at: at.into(), station: "W4EOC".into(), via: "7.240 HF".into(), note: "No contact".into() }
    }

    #[test]
    fn messages_and_steps_are_checked() {
        let m = clean_message(sitrep()).unwrap();
        assert_eq!(m.from_station, "Shelter 2");
        assert_eq!(m.received_at, "2026-10-03T14:00:00+00:00", "stored as UTC");
        let bad = |f: fn(&mut RelayMessageInput)| {
            let mut m = sitrep();
            f(&mut m);
            clean_message(m).unwrap_err()
        };
        assert!(bad(|m| m.from_station = " ".into()).contains("come from"));
        assert!(bad(|m| m.for_station = "".into()).contains("for"));
        assert!(bad(|m| m.message = "".into()).contains("message"));
        assert!(bad(|m| m.received_at = "10am".into()).contains("time received"));

        let received = &m.received_at;
        assert!(clean_step(step("passed", "2026-10-03T14:10:00Z"), received).is_ok());
        assert!(clean_step(step("passed", "2026-10-03T13:59:00Z"), received).unwrap_err().contains("before"));
        assert!(clean_step(step("lost", "2026-10-03T14:10:00Z"), received).is_err());
        let mut no_station = step("passed", "2026-10-03T14:10:00Z");
        no_station.station = "".into();
        assert!(clean_step(no_station, received).unwrap_err().contains("Who"));
        let mut no_reason = step("not_passed", "2026-10-03T14:10:00Z");
        no_reason.note = "".into();
        assert!(clean_step(no_reason, received).unwrap_err().contains("why"));
    }

    #[test]
    fn a_failed_attempt_keeps_it_held_until_passed() {
        let (r, a) = repo_with_activity();
        let m = clean_message(sitrep()).unwrap();
        let id = r.create_relay_message(&a, &m, None).unwrap();
        assert_eq!(r.get_relay_message(&id).unwrap().status, "held");

        let attempt = clean_step(step("attempt", "2026-10-03T14:10:00Z"), &m.received_at).unwrap();
        r.add_relay_step(&id, &attempt, None).unwrap();
        assert_eq!(r.get_relay_message(&id).unwrap().status, "held");

        let mut by_phone = step("passed", "2026-10-03T14:25:00Z");
        by_phone.via = "Phone".into();
        let passed = r.add_relay_step(&id, &clean_step(by_phone, &m.received_at).unwrap(), None).unwrap();
        let msg = r.get_relay_message(&id).unwrap();
        assert_eq!(msg.status, "passed");
        assert_eq!(msg.steps.iter().map(|s| s.kind.as_str()).collect::<Vec<_>>(), ["attempt", "passed"]);

        // Passed is final until undone.
        assert!(r.add_relay_step(&id, &attempt, None).unwrap_err().contains("already passed"));
        r.undo_relay_step(&passed).unwrap();
        assert_eq!(r.get_relay_message(&id).unwrap().status, "held");
        assert!(r.undo_relay_step(&passed).is_err(), "can't undo twice");
    }

    #[test]
    fn replies_removal_and_deleting_the_activity() {
        let (r, a) = repo_with_activity();
        let id = r.create_relay_message(&a, &clean_message(sitrep()).unwrap(), None).unwrap();
        let mut reply = sitrep();
        reply.from_station = "EOC".into();
        reply.for_station = "Shelter 2".into();
        reply.reply_to = Some(id.clone());
        let reply_id = r.create_relay_message(&a, &clean_message(reply.clone()).unwrap(), None).unwrap();
        assert_eq!(r.get_relay_message(&reply_id).unwrap().reply_to.as_deref(), Some(id.as_str()));

        let other = r.create_activity("Other net", "directed_net", None, None).unwrap();
        assert!(r.create_relay_message(&other, &clean_message(reply).unwrap(), None).unwrap_err().contains("isn't in this activity"));

        r.void_relay_message(&id, Some("duplicate")).unwrap();
        assert_eq!(r.list_relay_messages(&a).unwrap().len(), 1);
        assert_eq!(r.list_removed_relay_messages(&a).unwrap()[0].void_reason, "duplicate");
        r.restore_relay_message(&id).unwrap();
        assert_eq!(r.list_relay_messages(&a).unwrap().len(), 2);

        let counts = r.delete_activity_permanently(&a, None).unwrap();
        assert_eq!(counts.relay_messages, 2);
        assert!(r.list_relay_messages(&a).unwrap().is_empty());
    }
}
