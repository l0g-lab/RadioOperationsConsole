use super::{ensure_open, AppState};
use crate::relay::{clean_message, clean_step, RelayMessage, RelayMessageInput, RelayStepInput};
use crate::repo::Repository;
use tauri::State;

/// Changes are refused once the message's activity is closed.
fn ensure_message_open(repo: &Repository, message_id: &str) -> Result<String, String> {
    let activity_id = repo
        .activity_id_of_relay_message(message_id)
        .ok_or("That message no longer exists.")?;
    ensure_open(repo, &activity_id)?;
    Ok(activity_id)
}

fn audit(repo: &Repository, message_id: &str, action: &str, data: serde_json::Value, operator_id: Option<&str>) -> Result<(), String> {
    repo.create_audit_event("relay_message", message_id, action, Some(&data.to_string()), operator_id)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_relay_messages(state: State<AppState>, activity_id: String) -> Result<Vec<RelayMessage>, String> {
    state.repo.lock().unwrap().list_relay_messages(&activity_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_removed_relay_messages(state: State<AppState>, activity_id: String) -> Result<Vec<RelayMessage>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .list_removed_relay_messages(&activity_id)
        .map_err(|e| e.to_string())
}

/// Logs a message as it comes in (RELAY-010).
#[tauri::command]
pub fn create_relay_message(
    state: State<AppState>,
    activity_id: String,
    message: RelayMessageInput,
    operator_id: Option<String>,
) -> Result<String, String> {
    let repo = state.repo.lock().unwrap();
    ensure_open(&repo, &activity_id)?;
    let m = clean_message(message)?;
    let id = repo.create_relay_message(&activity_id, &m, operator_id.as_deref())?;
    audit(&repo, &id, "create", serde_json::to_value(&m).unwrap_or_default(), operator_id.as_deref())?;
    Ok(id)
}

/// Corrects what was logged when it came in.
#[tauri::command]
pub fn update_relay_message(
    state: State<AppState>,
    message_id: String,
    message: RelayMessageInput,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    ensure_message_open(&repo, &message_id)?;
    let before = repo.get_relay_message(&message_id).map_err(|e| e.to_string())?;
    let m = clean_message(message)?;
    repo.update_relay_message(&message_id, &m)?;
    let data = serde_json::json!({
        "before": {
            "received_at": before.received_at,
            "from_station": before.from_station,
            "for_station": before.for_station,
            "message": before.message,
            "received_via": before.received_via,
            "reply_to": before.reply_to,
        },
        "after": m,
    });
    audit(&repo, &message_id, "correct", data, operator_id.as_deref())
}

/// A failed attempt, passing the message on, or giving up on it (RELAY-020–022).
#[tauri::command]
pub fn add_relay_step(
    state: State<AppState>,
    message_id: String,
    step: RelayStepInput,
    operator_id: Option<String>,
) -> Result<String, String> {
    let repo = state.repo.lock().unwrap();
    let message = repo.get_relay_message(&message_id).map_err(|e| e.to_string())?;
    let s = clean_step(step, &message.received_at)?;
    let id = repo.add_relay_step(&message_id, &s, operator_id.as_deref())?;
    let mut data = serde_json::to_value(&s).unwrap_or_default();
    data["step_id"] = serde_json::Value::String(id.clone());
    audit(&repo, &message_id, &format!("relay_{}", s.kind), data, operator_id.as_deref())?;
    Ok(id)
}

/// Takes back a step recorded by mistake (RELAY-023).
#[tauri::command]
pub fn undo_relay_step(state: State<AppState>, step_id: String, operator_id: Option<String>) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    let message_id = repo.message_id_of_relay_step(&step_id).ok_or("That step no longer exists.")?;
    let step = repo
        .get_relay_message(&message_id)
        .map_err(|e| e.to_string())?
        .steps
        .into_iter()
        .find(|s| s.id == step_id);
    repo.undo_relay_step(&step_id).map_err(|_| "That step was already undone.".to_string())?;
    let data = serde_json::json!({ "step_id": step_id, "step": step.map(|s| serde_json::json!({
        "kind": s.kind, "at": s.at, "station": s.station, "via": s.via, "note": s.note,
    })) });
    audit(&repo, &message_id, "relay_undo", data, operator_id.as_deref())
}

#[tauri::command]
pub fn void_relay_message(
    state: State<AppState>,
    message_id: String,
    reason: Option<String>,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    ensure_message_open(&repo, &message_id)?;
    repo.void_relay_message(&message_id, reason.as_deref()).map_err(|e| e.to_string())?;
    audit(&repo, &message_id, "void", serde_json::json!({ "reason": reason }), operator_id.as_deref())
}

#[tauri::command]
pub fn restore_relay_message(state: State<AppState>, message_id: String, operator_id: Option<String>) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    ensure_message_open(&repo, &message_id)?;
    repo.restore_relay_message(&message_id).map_err(|e| e.to_string())?;
    audit(&repo, &message_id, "restore", serde_json::json!({}), operator_id.as_deref())
}
