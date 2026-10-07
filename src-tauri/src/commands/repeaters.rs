use super::AppState;
use crate::range_check;
use crate::repeaters::{self, Repeater, RepeaterDetails};
use crate::repo::Activity;
use tauri::State;

/// The repeater directory: in use, or with `retired`, the retired ones (RPT-010, RPT-011).
#[tauri::command]
pub fn list_repeaters(state: State<AppState>, retired: bool) -> Result<Vec<Repeater>, String> {
    state.repo.lock().unwrap().list_repeaters(retired).map_err(|e| e.to_string())
}

/// Adds a repeater, or with `repeater_id` replaces one's details, recording
/// the change. Returns its id.
#[tauri::command]
pub fn save_repeater(
    state: State<AppState>,
    repeater_id: Option<String>,
    details: RepeaterDetails,
    operator_id: Option<String>,
) -> Result<String, String> {
    let details = repeaters::clean(details)?;
    let repo = state.repo.lock().unwrap();
    let Some(id) = repeater_id else {
        let id = repo.create_repeater(&details).map_err(|e| e.to_string())?;
        let data = serde_json::json!({ "after": details }).to_string();
        repo.create_audit_event("repeater", &id, "create", Some(&data), operator_id.as_deref())
            .map_err(|e| e.to_string())?;
        return Ok(id);
    };
    let before = repo.get_repeater(&id).map_err(|_| "That repeater no longer exists.".to_string())?;
    repo.update_repeater(&id, &details).map_err(|e| e.to_string())?;
    let data = serde_json::json!({ "before": before.details, "after": details }).to_string();
    repo.create_audit_event("repeater", &id, "correct", Some(&data), operator_id.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(id)
}

/// Retires (hides) or restores a repeater. Activities are never changed (RPT-010).
#[tauri::command]
pub fn set_repeater_retired(
    state: State<AppState>,
    repeater_id: String,
    retired: bool,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    repo.set_repeater_retired(&repeater_id, retired).map_err(|e| e.to_string())?;
    let action = if retired { "retire" } else { "restore" };
    repo.create_audit_event("repeater", &repeater_id, action, None, operator_id.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Permanently deletes a retired repeater, recording what it was. Nets on it
/// keep its name and frequency as text (RPT-013).
#[tauri::command]
pub fn delete_repeater(state: State<AppState>, repeater_id: String, operator_id: Option<String>) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    let before = repo.get_repeater(&repeater_id).map_err(|_| "That repeater no longer exists.".to_string())?;
    let nets = repo.delete_repeater(&repeater_id)?;
    for (id, before, after) in nets {
        let data = serde_json::json!({ "before": before, "after": after }).to_string();
        repo.create_audit_event("net_listing", &id, "correct", Some(&data), operator_id.as_deref())
            .map_err(|e| e.to_string())?;
    }
    let data = serde_json::json!({ "before": before.details }).to_string();
    repo.create_audit_event("repeater", &repeater_id, "delete", Some(&data), operator_id.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Sets the repeater an activity runs on (picked from the directory or placed
/// by hand), or clears it with no point. A range check's can be moved, not
/// cleared (RANGE-002, RPT-021–023).
#[tauri::command]
pub fn set_activity_repeater(
    state: State<AppState>,
    activity_id: String,
    name: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
) -> Result<Activity, String> {
    let repo = state.repo.lock().unwrap();
    super::ensure_open(&repo, &activity_id)?;
    let activity = repo.get_activity(&activity_id).map_err(|e| e.to_string())?;
    let point = match (lat, lon) {
        (Some(lat), Some(lon)) => Some((lat, lon)),
        (None, None) => None,
        _ => return Err("A repeater's location needs both latitude and longitude.".into()),
    };
    if point.is_none() && range_check::is_range_check(&activity.activity_type) {
        return Err(range_check::REPEATER_CANNOT_CLEAR.to_string());
    }
    let name = name.as_deref().map(str::trim).filter(|n| !n.is_empty());
    repo.set_activity_repeater(&activity_id, name.filter(|_| point.is_some()), lat, lon)
        .map_err(|e| e.to_string())?;
    repo.get_activity(&activity_id).map_err(|e| e.to_string())
}
