use super::{AppState, ERR_OFFLINE};
use crate::connectors;
use crate::repo::{Activity, ActivitySummary, ActivityTemplate};
use tauri::State;

#[tauri::command]
pub fn list_activities(state: State<AppState>) -> Result<Vec<Activity>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .list_activities()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_activity(
    state: State<AppState>,
    title: String,
    activity_type: String,
    scheduled_at: Option<String>,
    frequency: Option<String>,
) -> Result<String, String> {
    state
        .repo
        .lock()
        .unwrap()
        .create_activity(
            &title,
            &activity_type,
            scheduled_at.as_deref(),
            frequency.as_deref(),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_archived_activities(state: State<AppState>) -> Result<Vec<Activity>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .list_archived_activities()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_activity(
    state: State<AppState>,
    activity_id: String,
    title: String,
    activity_type: String,
    scheduled_at: Option<String>,
    frequency: Option<String>,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    let before = repo.get_activity(&activity_id).map_err(|e| e.to_string())?;
    repo.update_activity(
        &activity_id,
        &title,
        &activity_type,
        scheduled_at.as_deref(),
        frequency.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    let data = serde_json::json!({
        "before": {
            "title": before.title,
            "activity_type": before.activity_type,
            "scheduled_at": before.scheduled_at,
            "frequency": before.frequency,
        },
        "after": { "title": title, "activity_type": activity_type, "scheduled_at": scheduled_at, "frequency": frequency },
    })
    .to_string();
    repo.create_audit_event(
        "activity",
        &activity_id,
        "correct",
        Some(&data),
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Resolves free-text into a per-activity location that takes precedence
/// over the operating operator's own default location on the check-in map
/// (CIMAP-060) — an operator may run this activity from a different site
/// than their usual QTH. Mirrors `set_operator_location`; an empty query
/// clears it, restoring the fallback to the operator's location.
#[tauri::command]
pub async fn set_activity_location(
    state: State<'_, AppState>,
    activity_id: String,
    query: String,
) -> Result<Activity, String> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        state
            .repo
            .lock()
            .unwrap()
            .set_activity_location(&activity_id, None, None, None)
            .map_err(|e| e.to_string())?;
        return state
            .repo
            .lock()
            .unwrap()
            .get_activity(&activity_id)
            .map_err(|e| e.to_string());
    }

    match connectors::geocode_location(trimmed).await {
        connectors::GeocodeOutcome::Found(r) => {
            let label = r.display_name.unwrap_or_else(|| trimmed.to_string());
            state
                .repo
                .lock()
                .unwrap()
                .set_activity_location(&activity_id, Some(&label), Some(r.lat), Some(r.lon))
                .map_err(|e| e.to_string())?;
            state
                .repo
                .lock()
                .unwrap()
                .get_activity(&activity_id)
                .map_err(|e| e.to_string())
        }
        connectors::GeocodeOutcome::NotFound => {
            Err("No location found matching that text.".to_string())
        }
        connectors::GeocodeOutcome::Offline => Err(ERR_OFFLINE.to_string()),
        connectors::GeocodeOutcome::Error(e) => Err(e),
    }
}

/// Sets an activity's location directly from known coordinates — a map
/// click or manually typed GPS coordinates — with no geocoding round trip,
/// for sites too new or precise to resolve from a zip/city/address
/// (CIMAP-073).
#[tauri::command]
pub async fn set_activity_location_coords(
    state: State<'_, AppState>,
    activity_id: String,
    lat: f64,
    lon: f64,
    label: Option<String>,
) -> Result<Activity, String> {
    let repo = state.repo.lock().unwrap();
    repo.set_activity_location(&activity_id, label.as_deref(), Some(lat), Some(lon))
        .map_err(|e| e.to_string())?;
    repo.get_activity(&activity_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn archive_activity(
    state: State<AppState>,
    activity_id: String,
    reason: Option<String>,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    repo.archive_activity(&activity_id)
        .map_err(|e| e.to_string())?;
    let data = serde_json::json!({ "reason": reason }).to_string();
    repo.create_audit_event(
        "activity",
        &activity_id,
        "archive",
        Some(&data),
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restore_activity(
    state: State<AppState>,
    activity_id: String,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    repo.restore_activity(&activity_id)
        .map_err(|e| e.to_string())?;
    repo.create_audit_event(
        "activity",
        &activity_id,
        "restore",
        None,
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_activity_templates(state: State<AppState>) -> Result<Vec<ActivityTemplate>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .list_activity_templates()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_activity_template(
    state: State<AppState>,
    name: String,
    title: String,
    activity_type: String,
    scheduled_time: Option<String>,
    frequency: Option<String>,
    location_label: Option<String>,
    location_lat: Option<f64>,
    location_lon: Option<f64>,
) -> Result<String, String> {
    let name = name.trim();
    let title = title.trim();
    if name.is_empty() || title.is_empty() {
        return Err("A template needs a name and a title.".to_string());
    }
    state
        .repo
        .lock()
        .unwrap()
        .save_activity_template(
            name,
            title,
            &activity_type,
            scheduled_time.as_deref().map(str::trim).filter(|s| !s.is_empty()),
            frequency.as_deref().map(str::trim).filter(|s| !s.is_empty()),
            location_label.as_deref().map(str::trim).filter(|s| !s.is_empty()),
            location_lat,
            location_lon,
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_activity_template(state: State<AppState>, template_id: String) -> Result<(), String> {
    state
        .repo
        .lock()
        .unwrap()
        .delete_activity_template(&template_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_activity_template(
    state: State<AppState>,
    template_id: String,
    name: String,
    title: String,
    activity_type: String,
    scheduled_time: Option<String>,
    frequency: Option<String>,
    location_label: Option<String>,
    location_lat: Option<f64>,
    location_lon: Option<f64>,
) -> Result<(), String> {
    let name = name.trim();
    let title = title.trim();
    if name.is_empty() || title.is_empty() {
        return Err("A template needs a name and a title.".to_string());
    }
    state.repo.lock().unwrap().update_activity_template(
        &template_id,
        name,
        title,
        &activity_type,
        scheduled_time.as_deref().map(str::trim).filter(|s| !s.is_empty()),
        frequency.as_deref().map(str::trim).filter(|s| !s.is_empty()),
        location_label.as_deref().map(str::trim).filter(|s| !s.is_empty()),
        location_lat,
        location_lon,
    )
}

/// Scheduled -> active: the net has begun.
#[tauri::command]
pub fn start_activity(
    state: State<AppState>,
    activity_id: String,
    operator_id: Option<String>,
) -> Result<(), String> {
    state.repo.lock().unwrap().transition_activity(
        &activity_id,
        "active",
        None,
        None,
        operator_id.as_deref(),
    )
}

/// Active -> closed, keeping the operator's closing notes.
#[tauri::command]
pub fn close_activity(
    state: State<AppState>,
    activity_id: String,
    conclusion: Option<String>,
    operator_id: Option<String>,
) -> Result<(), String> {
    state.repo.lock().unwrap().transition_activity(
        &activity_id,
        "closed",
        None,
        conclusion.as_deref(),
        operator_id.as_deref(),
    )
}

/// Closed -> active again; a reason is required.
#[tauri::command]
pub fn reopen_activity(
    state: State<AppState>,
    activity_id: String,
    reason: String,
    operator_id: Option<String>,
) -> Result<(), String> {
    state.repo.lock().unwrap().transition_activity(
        &activity_id,
        "active",
        Some(&reason),
        None,
        operator_id.as_deref(),
    )
}

#[tauri::command]
pub fn activity_summary(
    state: State<AppState>,
    activity_id: String,
) -> Result<ActivitySummary, String> {
    state
        .repo
        .lock()
        .unwrap()
        .activity_summary(&activity_id)
        .map_err(|e| e.to_string())
}
