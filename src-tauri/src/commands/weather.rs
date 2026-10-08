use super::{persist_settings, AppSettings, AppState};
use crate::connectors;
use chrono::Utc;
use serde_json::Value;
use tauri::State;

/// Clears the weather area, so alerts and the forecast ask for one again
/// (NWSA-005). Setting it goes through the shared place resolver
/// (placeText.ts, LOCRES-060) and `set_weather_area_coords`.
#[tauri::command]
pub fn clear_weather_area(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let mut settings = state.settings.lock().unwrap().clone();
    settings.weather_area_query = String::new();
    settings.weather_area_label = String::new();
    settings.weather_area_lat = None;
    settings.weather_area_lon = None;
    settings.weather_area_resolved_at = None;
    persist_settings(&state, &settings)?;
    Ok(settings)
}

/// Sets the weather area of interest directly from known coordinates — a
/// map click or typed GPS coordinates from `LocationPicker` — with no
/// geocoding round trip, so it works offline (CIMAP-073), the same way
/// operator/activity/check-in locations are set. The query field is filled
/// with the label (or the coordinates) so the text box still reflects it.
#[tauri::command]
pub fn set_weather_area_coords(
    state: State<'_, AppState>,
    lat: f64,
    lon: f64,
    label: Option<String>,
) -> Result<AppSettings, String> {
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) {
        return Err("Latitude must be -90..90 and longitude -180..180.".to_string());
    }
    let mut settings = state.settings.lock().unwrap().clone();
    let label = label
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .unwrap_or_else(|| format!("{lat:.4}, {lon:.4}"));
    settings.weather_area_query = label.clone();
    settings.weather_area_label = label;
    settings.weather_area_lat = Some(lat);
    settings.weather_area_lon = Some(lon);
    settings.weather_area_resolved_at = Some(Utc::now().to_rfc3339());
    persist_settings(&state, &settings)?;
    Ok(settings)
}

/// Active NWS alerts at a point: the one given (a net's repeater, say), or
/// else the weather area of interest. Never nationwide: with neither, it
/// errs, as the forecast does (NWSA-021).
#[tauri::command]
pub async fn fetch_nws_alerts(
    state: State<'_, AppState>,
    lat: Option<f64>,
    lon: Option<f64>,
) -> Result<Value, String> {
    if crate::net::working_offline() {
        return Err(crate::net::WORKING_OFFLINE_MESSAGE.to_string());
    }
    let (key, area) = {
        let settings = state.settings.lock().unwrap();
        let key = if settings.nws_api_key.is_empty() {
            None
        } else {
            Some(settings.nws_api_key.clone())
        };
        let area = match (settings.weather_area_lat, settings.weather_area_lon) {
            (Some(lat), Some(lon)) => Some((lat, lon)),
            _ => None,
        };
        (key, area)
    };
    let point = match (lat, lon) {
        (Some(lat), Some(lon)) => (lat, lon),
        _ => area.ok_or_else(|| "No area of interest set.".to_string())?,
    };
    connectors::fetch_nws_alerts(key.as_deref(), Some(point))
        .await
        .map_err(|e| e.to_string())
}

/// The radar loop's scan times, oldest first (RADAR-011). Fetched here, not
/// by the window, like the app's other online requests.
#[tauri::command]
pub async fn fetch_radar_frames() -> Result<Vec<String>, String> {
    if crate::net::working_offline() {
        return Err(crate::net::WORKING_OFFLINE_MESSAGE.to_string());
    }
    crate::weather::fetch_radar_frames().await.map_err(|e| e.to_string())
}

/// What it's doing now at a point: the nearest NWS station's latest reading,
/// or None when none nearby has reported in the last 90 minutes.
#[tauri::command]
pub async fn fetch_current_weather(lat: f64, lon: f64) -> Result<Option<crate::weather::CurrentWeather>, String> {
    if crate::net::working_offline() {
        return Err(crate::net::WORKING_OFFLINE_MESSAGE.to_string());
    }
    crate::weather::fetch_current(lat, lon).await.map_err(|e| e.to_string())
}

/// Fetches the current forecast for the configured weather area of
/// interest. Unlike alerts, a forecast is inherently point-based and has
/// no unscoped fallback — this errs with a clear message when no area is
/// set rather than guessing a location.
#[tauri::command]
pub async fn fetch_nws_forecast(state: State<'_, AppState>) -> Result<Value, String> {
    if crate::net::working_offline() {
        return Err(crate::net::WORKING_OFFLINE_MESSAGE.to_string());
    }
    let point = {
        let settings = state.settings.lock().unwrap();
        match (settings.weather_area_lat, settings.weather_area_lon) {
            (Some(lat), Some(lon)) => Some((lat, lon)),
            _ => None,
        }
    };
    let (lat, lon) = point.ok_or_else(|| "No area of interest set.".to_string())?;
    connectors::fetch_nws_forecast(lat, lon)
        .await
        .map_err(|e| e.to_string())
}
