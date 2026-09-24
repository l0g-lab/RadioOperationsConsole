use super::{ensure_open, ensure_report_open, AppState};
use crate::repo::SpotterReport;
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
) -> Result<String, String> {
    let repo = state.repo.lock().unwrap();
    ensure_open(&repo, &activity_id)?;
    repo.create_spotter_report(
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
        .map_err(|e| e.to_string())
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
