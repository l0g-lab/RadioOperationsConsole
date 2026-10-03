use super::AppState;
use crate::places::{self, Place, PlaceDetails};
use tauri::State;

/// Saved places, by name (PLACE-010).
#[tauri::command]
pub fn list_places(state: State<AppState>) -> Result<Vec<Place>, String> {
    state.repo.lock().unwrap().list_places().map_err(|e| e.to_string())
}

/// Adds a place, or with `place_id` replaces one's details, recording the
/// change. Returns its id.
#[tauri::command]
pub fn save_place(
    state: State<AppState>,
    place_id: Option<String>,
    details: PlaceDetails,
    operator_id: Option<String>,
) -> Result<String, String> {
    let details = places::clean(details)?;
    let repo = state.repo.lock().unwrap();
    let Some(id) = place_id else {
        let id = repo.create_place(&details).map_err(|e| e.to_string())?;
        let data = serde_json::json!({ "after": details }).to_string();
        repo.create_audit_event("place", &id, "create", Some(&data), operator_id.as_deref())
            .map_err(|e| e.to_string())?;
        return Ok(id);
    };
    let before = repo.get_place(&id).map_err(|_| "That place no longer exists.".to_string())?;
    repo.update_place(&id, &details).map_err(|e| e.to_string())?;
    let data = serde_json::json!({ "before": before.details, "after": details }).to_string();
    repo.create_audit_event("place", &id, "correct", Some(&data), operator_id.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(id)
}

/// Deletes a place, recording what it was. Activities keep their own copy of
/// any location set from it (PLACE-011).
#[tauri::command]
pub fn delete_place(state: State<AppState>, place_id: String, operator_id: Option<String>) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    let before = repo.get_place(&place_id).map_err(|_| "That place no longer exists.".to_string())?;
    repo.delete_place(&place_id).map_err(|e| e.to_string())?;
    let data = serde_json::json!({ "before": before.details }).to_string();
    repo.create_audit_event("place", &place_id, "delete", Some(&data), operator_id.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(())
}
