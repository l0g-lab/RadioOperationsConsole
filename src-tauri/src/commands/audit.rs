use super::{ensure_open, AppState};
use crate::repo::{AuditEvent, HistoryEvent};
use tauri::State;

#[tauri::command]
pub fn create_audit_event(
    state: State<AppState>,
    entity_type: String,
    entity_id: String,
    action: String,
    data: Option<String>,
    operator_id: Option<String>,
) -> Result<String, String> {
    let repo = state.repo.lock().unwrap();
    // Log and traffic entries are ordinary records of an activity.
    if entity_type == "activity"
        && matches!(
            action.as_str(),
            "activity_entry" | "traffic_item" | "traffic_marked_none" | "linked_report"
        )
    {
        ensure_open(&repo, &entity_id)?;
    }
    repo.create_audit_event(
        &entity_type,
        &entity_id,
        &action,
        data.as_deref(),
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_audit_events(
    state: State<AppState>,
    entity_id: String,
) -> Result<Vec<AuditEvent>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .list_audit_events(&entity_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_recent_audit_events(
    state: State<AppState>,
    limit: i64,
) -> Result<Vec<AuditEvent>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .list_recent_audit_events(limit)
        .map_err(|e| e.to_string())
}

/// Everything recorded about one activity, for exporting.
#[tauri::command]
pub fn activity_history(
    state: State<AppState>,
    activity_id: String,
) -> Result<Vec<HistoryEvent>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .activity_history(&activity_id)
        .map_err(|e| e.to_string())
}
