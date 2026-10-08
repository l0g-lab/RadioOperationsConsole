use super::{ensure_open, ensure_report_open, AppState};
use crate::repo::{ActivityAlert, SpotterReport};
use tauri::State;

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_spotter_report(
    state: State<AppState>,
    activity_id: String,
    reported_at: String,
    county: Option<String>,
    location_text: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
    reporter: Option<String>,
    hazard_type: String,
    magnitude: Option<String>,
    source: Option<String>,
    notes: Option<String>,
    checkin_id: Option<String>,
    operator_id: Option<String>,
    location_how: Option<String>,
) -> Result<String, String> {
    let repo = state.repo.lock().unwrap();
    ensure_open(&repo, &activity_id)?;
    let id = repo.create_spotter_report(
        &activity_id,
        &reported_at,
        county.as_deref(),
        location_text.as_deref(),
        lat,
        lon,
        reporter.as_deref(),
        &hazard_type,
        magnitude.as_deref(),
        source.as_deref(),
        notes.as_deref(),
        checkin_id.as_deref(),
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    // How its point was arrived at (LOCRES-064), when it's on the map.
    if let Some(how) = location_how.filter(|_| lat.is_some()) {
        repo.set_report_location_how(&id, &how).map_err(|e| e.to_string())?;
    }
    Ok(id)
}

#[tauri::command]
pub fn list_spotter_reports(
    state: State<AppState>,
    activity_id: String,
) -> Result<Vec<SpotterReport>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .list_spotter_reports(&activity_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_voided_spotter_reports(
    state: State<AppState>,
    activity_id: String,
) -> Result<Vec<SpotterReport>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .list_voided_spotter_reports(&activity_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_spotter_report(
    state: State<AppState>,
    report_id: String,
    reported_at: String,
    county: Option<String>,
    location_text: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
    reporter: Option<String>,
    hazard_type: String,
    magnitude: Option<String>,
    source: Option<String>,
    notes: Option<String>,
    checkin_id: Option<String>,
    operator_id: Option<String>,
    location_how: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    ensure_report_open(&repo, &report_id)?;
    let before = repo
        .get_spotter_report(&report_id)
        .map_err(|e| e.to_string())?;
    repo.update_spotter_report(
        &report_id,
        &reported_at,
        county.as_deref(),
        location_text.as_deref(),
        lat,
        lon,
        reporter.as_deref(),
        &hazard_type,
        magnitude.as_deref(),
        source.as_deref(),
        notes.as_deref(),
        checkin_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    if let Some(how) = &location_how {
        repo.set_report_location_how(&report_id, if lat.is_some() { how } else { "" })
            .map_err(|e| e.to_string())?;
    }
    let data = serde_json::json!({
        "before": {
            "reported_at": before.reported_at,
            "county": before.county,
            "location_text": before.location_text,
            "lat": before.lat,
            "lon": before.lon,
            "reporter": before.reporter,
            "hazard_type": before.hazard_type,
            "magnitude": before.magnitude,
            "source": before.source,
            "notes": before.notes,
            "checkin_id": before.checkin_id,
        },
        "after": {
            "reported_at": reported_at,
            "county": county,
            "location_text": location_text,
            "lat": lat,
            "lon": lon,
            "reporter": reporter,
            "hazard_type": hazard_type,
            "magnitude": magnitude,
            "source": source,
            "notes": notes,
            "checkin_id": checkin_id,
        },
    })
    .to_string();
    repo.create_audit_event(
        "spotter_report",
        &report_id,
        "correct",
        Some(&data),
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn void_spotter_report(
    state: State<AppState>,
    report_id: String,
    reason: Option<String>,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    ensure_report_open(&repo, &report_id)?;
    repo.void_spotter_report(&report_id, reason.as_deref())
        .map_err(|e| e.to_string())?;
    let data = serde_json::json!({ "reason": reason }).to_string();
    repo.create_audit_event(
        "spotter_report",
        &report_id,
        "void",
        Some(&data),
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restore_spotter_report(
    state: State<AppState>,
    report_id: String,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    ensure_report_open(&repo, &report_id)?;
    repo.restore_spotter_report(&report_id)
        .map_err(|e| e.to_string())?;
    repo.create_audit_event(
        "spotter_report",
        &report_id,
        "restore",
        None,
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// What the history keeps of an attached alert, so it reads after the alert is gone.
fn alert_data(a: &ActivityAlert) -> String {
    serde_json::json!({
        "event": a.event,
        "area_desc": a.area_desc,
        "effective": a.effective,
        "ends": a.ends,
    })
    .to_string()
}

/// Attaches a copy of an NWS alert to a net (SPOT-060). Allowed on a closed
/// net too: attaching what was in effect is part of finishing its record
/// (LIFE-013).
#[tauri::command]
pub fn attach_activity_alert(
    state: State<AppState>,
    activity_id: String,
    alert: ActivityAlert,
    operator_id: Option<String>,
) -> Result<ActivityAlert, String> {
    let repo = state.repo.lock().unwrap();
    repo.get_activity(&activity_id).map_err(|_| "That activity no longer exists.".to_string())?;
    let saved = repo.attach_activity_alert(&activity_id, &alert)?;
    repo.create_audit_event("activity", &activity_id, "alert_attached", Some(&alert_data(&saved)), operator_id.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(saved)
}

#[tauri::command]
pub fn detach_activity_alert(
    state: State<AppState>,
    alert_id: String,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    let (activity_id, alert) = repo.detach_activity_alert(&alert_id)?;
    repo.create_audit_event("activity", &activity_id, "alert_removed", Some(&alert_data(&alert)), operator_id.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_activity_alerts(state: State<AppState>, activity_id: String) -> Result<Vec<ActivityAlert>, String> {
    state.repo.lock().unwrap().list_activity_alerts(&activity_id).map_err(|e| e.to_string())
}
