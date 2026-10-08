use super::AppState;
use crate::repo::Operator;
use tauri::State;

#[tauri::command]
pub fn list_operators(state: State<AppState>) -> Result<Vec<Operator>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .list_operators()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_retired_operators(state: State<AppState>) -> Result<Vec<Operator>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .list_retired_operators()
        .map_err(|e| e.to_string())
}

/// Where the operator is named, to show when removing them (AUDIT-013).
#[tauri::command]
pub fn operator_usage(state: State<AppState>, operator_id: String) -> Result<crate::repo::OperatorUsage, String> {
    state.repo.lock().unwrap().operator_usage(&operator_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_operator(state: State<AppState>, operator_id: String) -> Result<(), String> {
    state.repo.lock().unwrap().delete_operator(&operator_id)
}

/// Hides an operator from lists, keeping them for history. `acting_operator_id`
/// is who did it, for the audit event.
#[tauri::command]
pub fn retire_operator(
    state: State<AppState>,
    operator_id: String,
    acting_operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    repo.retire_operator(&operator_id)
        .map_err(|e| e.to_string())?;
    repo.create_audit_event(
        "operator",
        &operator_id,
        "retire",
        None,
        acting_operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restore_operator(
    state: State<AppState>,
    operator_id: String,
    acting_operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    repo.restore_operator(&operator_id)
        .map_err(|e| e.to_string())?;
    repo.create_audit_event(
        "operator",
        &operator_id,
        "restore",
        None,
        acting_operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Corrects an operator's name and call sign (AUDIT-015), recorded in the
/// history with the earlier values.
#[tauri::command]
pub fn update_operator(
    state: State<AppState>,
    operator_id: String,
    display_name: String,
    call_sign: Option<String>,
    acting_operator_id: Option<String>,
) -> Result<(), String> {
    let name = display_name.trim();
    if name.is_empty() {
        return Err("Give the operator a name.".into());
    }
    let call = call_sign.map(|c| c.trim().to_uppercase()).filter(|c| !c.is_empty());
    let repo = state.repo.lock().unwrap();
    let before = repo
        .list_operators()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|o| o.id == operator_id)
        .ok_or("That operator no longer exists.")?;
    repo.update_operator(&operator_id, name, call.as_deref()).map_err(|e| e.to_string())?;
    let data = serde_json::json!({
        "before": { "display_name": before.display_name, "call_sign": before.call_sign },
        "after": { "display_name": name, "call_sign": call },
    })
    .to_string();
    repo.create_audit_event("operator", &operator_id, "correct", Some(&data), acting_operator_id.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_operator(
    state: State<AppState>,
    display_name: String,
    call_sign: Option<String>,
) -> Result<String, String> {
    state
        .repo
        .lock()
        .unwrap()
        .create_operator(&display_name, call_sign.as_deref())
        .map_err(|e| e.to_string())
}

/// Clears an operator's location. Setting one goes through the shared place
/// resolver (placeText.ts, LOCRES-060) and `set_operator_location_coords`.
#[tauri::command]
pub fn clear_operator_location(state: State<'_, AppState>, operator_id: String) -> Result<Operator, String> {
    let repo = state.repo.lock().unwrap();
    repo.set_operator_location(&operator_id, None, None, None)
        .map_err(|e| e.to_string())?;
    repo.get_operator(&operator_id).map_err(|e| e.to_string())
}

/// Sets an operator's location directly from known coordinates — a map
/// click or manually typed GPS coordinates — with no geocoding round trip
/// (CIMAP-073). `label` is whatever the caller has for a human-readable
/// description (a geocode result's display name, or empty for a bare pin).
#[tauri::command]
pub async fn set_operator_location_coords(
    state: State<'_, AppState>,
    operator_id: String,
    lat: f64,
    lon: f64,
    label: Option<String>,
) -> Result<Operator, String> {
    let repo = state.repo.lock().unwrap();
    repo.set_operator_location(&operator_id, label.as_deref(), Some(lat), Some(lon))
        .map_err(|e| e.to_string())?;
    repo.get_operator(&operator_id).map_err(|e| e.to_string())
}
