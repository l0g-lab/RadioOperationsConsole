use super::{AppState, ERR_OFFLINE};
use crate::connectors;
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

/// Resolves free-text (zip code, city/state, address, landmark) into the
/// persisted directory/QTH location for an operator profile
/// (CIMAP-060/061), the same way `set_weather_area` resolves the weather
/// area of interest. Passing an empty/whitespace-only query clears it.
#[tauri::command]
pub async fn set_operator_location(
    state: State<'_, AppState>,
    operator_id: String,
    query: String,
) -> Result<Operator, String> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        state
            .repo
            .lock()
            .unwrap()
            .set_operator_location(&operator_id, None, None, None)
            .map_err(|e| e.to_string())?;
        return state
            .repo
            .lock()
            .unwrap()
            .get_operator(&operator_id)
            .map_err(|e| e.to_string());
    }

    match connectors::geocode_location(trimmed).await {
        connectors::GeocodeOutcome::Found(r) => {
            let label = r.display_name.unwrap_or_else(|| trimmed.to_string());
            state
                .repo
                .lock()
                .unwrap()
                .set_operator_location(&operator_id, Some(&label), Some(r.lat), Some(r.lon))
                .map_err(|e| e.to_string())?;
            state
                .repo
                .lock()
                .unwrap()
                .get_operator(&operator_id)
                .map_err(|e| e.to_string())
        }
        connectors::GeocodeOutcome::NotFound => {
            Err("No location found matching that text.".to_string())
        }
        connectors::GeocodeOutcome::Offline => Err(ERR_OFFLINE.to_string()),
        connectors::GeocodeOutcome::Error(e) => Err(e),
    }
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
