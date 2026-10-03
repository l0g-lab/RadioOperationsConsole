use super::AppState;
use crate::ics214::{self, Ics214Details, Ics214Log};
use tauri::State;

/// Saved ICS 214 activity logs, newest period first.
#[tauri::command]
pub fn list_ics214_logs(state: State<AppState>) -> Result<Vec<Ics214Log>, String> {
    state.repo.lock().unwrap().list_ics214_logs().map_err(|e| e.to_string())
}

/// Adds a log, or with `log_id` replaces one's details, recording the change.
/// Returns the log as saved (tidied and in time order).
#[tauri::command]
pub fn save_ics214_log(
    state: State<AppState>,
    log_id: Option<String>,
    details: Ics214Details,
    operator_id: Option<String>,
) -> Result<Ics214Log, String> {
    let details = ics214::clean(details)?;
    let repo = state.repo.lock().unwrap();
    let id = match log_id {
        None => {
            let id = repo.create_ics214_log(&details).map_err(|e| e.to_string())?;
            let data = serde_json::json!({ "incident_name": details.incident_name, "from": details.period_from, "to": details.period_to }).to_string();
            repo.create_audit_event("ics214_log", &id, "create", Some(&data), operator_id.as_deref())
                .map_err(|e| e.to_string())?;
            id
        }
        Some(id) => {
            let before = repo.get_ics214_log(&id).map_err(|_| "That activity log no longer exists.".to_string())?;
            repo.update_ics214_log(&id, &details).map_err(|e| e.to_string())?;
            let data = serde_json::json!({ "before": before.details, "after": details }).to_string();
            repo.create_audit_event("ics214_log", &id, "correct", Some(&data), operator_id.as_deref())
                .map_err(|e| e.to_string())?;
            id
        }
    };
    repo.get_ics214_log(&id).map_err(|e| e.to_string())
}

/// Deletes a saved log, recording what it was. The records it was made from
/// are untouched.
#[tauri::command]
pub fn delete_ics214_log(state: State<AppState>, log_id: String, operator_id: Option<String>) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    let before = repo.get_ics214_log(&log_id).map_err(|_| "That activity log no longer exists.".to_string())?;
    repo.delete_ics214_log(&log_id).map_err(|e| e.to_string())?;
    let data = serde_json::json!({ "before": before.details }).to_string();
    repo.create_audit_event("ics214_log", &log_id, "delete", Some(&data), operator_id.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(())
}
