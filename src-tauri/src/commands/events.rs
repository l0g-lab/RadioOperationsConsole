use super::AppState;
use crate::events::{clean, Event};
use crate::repo::Repository;
use tauri::State;

fn audit(repo: &Repository, entity: &str, id: &str, action: &str, data: serde_json::Value, operator_id: Option<&str>) -> Result<(), String> {
    repo.create_audit_event(entity, id, action, Some(&data.to_string()), operator_id)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_events(state: State<AppState>) -> Result<Vec<Event>, String> {
    state.repo.lock().unwrap().list_events().map_err(|e| e.to_string())
}

/// Adds an event (no id) or renames / re-dates one.
#[tauri::command]
pub fn save_event(
    state: State<AppState>,
    event_id: Option<String>,
    name: String,
    date: String,
    operator_id: Option<String>,
) -> Result<String, String> {
    let (name, date) = clean(&name, &date)?;
    let repo = state.repo.lock().unwrap();
    let before = match event_id.as_deref() {
        Some(id) => Some(repo.get_event(id).map_err(|_| "That event no longer exists.".to_string())?),
        None => None,
    };
    let id = repo.save_event(event_id.as_deref(), &name, date.as_deref()).map_err(|e| e.to_string())?;
    let after = serde_json::json!({ "name": name, "date": date });
    match before {
        Some(b) => audit(&repo, "event", &id, "correct", serde_json::json!({ "before": b, "after": after }), operator_id.as_deref())?,
        None => audit(&repo, "event", &id, "create", after, operator_id.as_deref())?,
    }
    Ok(id)
}

/// Removes an event; its activities and activity log stay, out of the event.
#[tauri::command]
pub fn delete_event(state: State<AppState>, event_id: String, operator_id: Option<String>) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    let event = repo.get_event(&event_id).map_err(|_| "That event no longer exists.".to_string())?;
    repo.delete_event(&event_id).map_err(|e| e.to_string())?;
    audit(&repo, "event", &event_id, "delete", serde_json::json!({ "name": event.name }), operator_id.as_deref())
}

/// Puts an activity in an event, or takes it out (no event). Recorded in its history.
#[tauri::command]
pub fn set_activity_event(
    state: State<AppState>,
    activity_id: String,
    event_id: Option<String>,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    let before = repo.get_activity(&activity_id).map_err(|e| e.to_string())?;
    let event_id = event_id.filter(|s| !s.is_empty());
    let name = match event_id.as_deref() {
        Some(id) => repo.get_event(id).map_err(|_| "That event no longer exists.".to_string())?.name,
        None => String::new(),
    };
    if before.event_id == event_id.clone().unwrap_or_default() {
        return Ok(());
    }
    repo.set_activity_event(&activity_id, event_id.as_deref()).map_err(|e| e.to_string())?;
    audit(&repo, "activity", &activity_id, "set_event", serde_json::json!({ "before": before.event, "after": name }), operator_id.as_deref())
}
