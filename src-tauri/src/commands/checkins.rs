use super::{ensure_checkin_open, ensure_open, AppState};
use crate::repo::Checkin;
use tauri::State;

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_checkin(
    state: State<AppState>,
    activity_id: String,
    call_sign: String,
    name: Option<String>,
    qth_location: Option<String>,
    grid_square: Option<String>,
    address: Option<String>,
    operator_id: Option<String>,
    location_lat: Option<f64>,
    location_lon: Option<f64>,
    location_label: Option<String>,
    has_traffic: bool,
    traffic: Option<String>,
) -> Result<String, String> {
    let repo = state.repo.lock().unwrap();
    ensure_open(&repo, &activity_id)?;
    repo.create_checkin(
            &activity_id,
            &call_sign,
            name.as_deref(),
            qth_location.as_deref(),
            grid_square.as_deref(),
            address.as_deref(),
            operator_id.as_deref(),
            location_lat,
            location_lon,
            location_label.as_deref(),
            has_traffic,
            traffic.as_deref(),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_checkins(state: State<AppState>, activity_id: String) -> Result<Vec<Checkin>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .list_checkins(&activity_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_voided_checkins(
    state: State<AppState>,
    activity_id: String,
) -> Result<Vec<Checkin>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .list_voided_checkins(&activity_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_checkin(
    state: State<AppState>,
    checkin_id: String,
    call_sign: String,
    name: Option<String>,
    qth_location: Option<String>,
    grid_square: Option<String>,
    address: Option<String>,
    operator_id: Option<String>,
    location_lat: Option<f64>,
    location_lon: Option<f64>,
    location_label: Option<String>,
    has_traffic: bool,
    traffic: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    ensure_checkin_open(&repo, &checkin_id)?;
    let before = repo.get_checkin(&checkin_id).map_err(|e| e.to_string())?;
    repo.update_checkin(
        &checkin_id,
        &call_sign,
        name.as_deref(),
        qth_location.as_deref(),
        grid_square.as_deref(),
        address.as_deref(),
        location_lat,
        location_lon,
        location_label.as_deref(),
        has_traffic,
        traffic.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    let data = serde_json::json!({
        "before": {
            "call_sign": before.call_sign,
            "name": before.name,
            "qth_location": before.qth_location,
            "grid_square": before.grid_square,
            "address": before.address,
            "location_lat": before.location_lat,
            "location_lon": before.location_lon,
            "has_traffic": before.has_traffic,
            "traffic": before.traffic,
        },
        "after": {
            "call_sign": call_sign,
            "name": name,
            "qth_location": qth_location,
            "grid_square": grid_square,
            "address": address,
            "location_lat": location_lat,
            "location_lon": location_lon,
            "has_traffic": has_traffic,
            "traffic": traffic,
        },
    })
    .to_string();
    repo.create_audit_event(
        "checkin",
        &checkin_id,
        "correct",
        Some(&data),
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn void_checkin(
    state: State<AppState>,
    checkin_id: String,
    reason: Option<String>,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    ensure_checkin_open(&repo, &checkin_id)?;
    repo.void_checkin(&checkin_id, reason.as_deref())
        .map_err(|e| e.to_string())?;
    let data = serde_json::json!({ "reason": reason }).to_string();
    repo.create_audit_event(
        "checkin",
        &checkin_id,
        "void",
        Some(&data),
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restore_checkin(
    state: State<AppState>,
    checkin_id: String,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    ensure_checkin_open(&repo, &checkin_id)?;
    repo.restore_checkin(&checkin_id)
        .map_err(|e| e.to_string())?;
    repo.create_audit_event(
        "checkin",
        &checkin_id,
        "restore",
        None,
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Sets a check-in's location directly from known coordinates — a map click
/// or manually typed GPS coordinates — overriding whatever was auto-resolved
/// from its qth_location/grid_square/address. Mirrors
/// `set_operator_location_coords`/`set_activity_location_coords` (CIMAP-073).
#[tauri::command]
pub fn set_checkin_location_coords(
    state: State<AppState>,
    checkin_id: String,
    lat: f64,
    lon: f64,
    label: Option<String>,
) -> Result<Checkin, String> {
    let repo = state.repo.lock().unwrap();
    ensure_checkin_open(&repo, &checkin_id)?;
    repo.set_checkin_location_coords(&checkin_id, lat, lon, label.as_deref())
        .map_err(|e| e.to_string())?;
    repo.get_checkin(&checkin_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_checkin_location(
    state: State<AppState>,
    checkin_id: String,
) -> Result<Checkin, String> {
    let repo = state.repo.lock().unwrap();
    ensure_checkin_open(&repo, &checkin_id)?;
    repo.clear_checkin_location(&checkin_id)
        .map_err(|e| e.to_string())?;
    repo.get_checkin(&checkin_id).map_err(|e| e.to_string())
}

/// Marks a check-in's traffic as dealt with (or not).
#[tauri::command]
pub fn set_checkin_traffic_handled(
    state: State<AppState>,
    checkin_id: String,
    handled: bool,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    ensure_checkin_open(&repo, &checkin_id)?;
    repo.set_checkin_traffic_handled(&checkin_id, handled)
        .map_err(|e| e.to_string())?;
    let data = serde_json::json!({ "handled": handled }).to_string();
    repo.create_audit_event(
        "checkin",
        &checkin_id,
        "traffic_handled",
        Some(&data),
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
