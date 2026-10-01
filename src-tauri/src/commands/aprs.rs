use super::AppState;
use crate::aprs_is;
use tauri::{AppHandle, State};

/// Starts (or, if one is already running, replaces) a live APRS-IS feed
/// filtered to a radius around (lat, lon). No API key needed — see
/// `aprs_is::start_stream` for why. Received packets stream to the frontend
/// as `aprs-is-packet` events rather than being returned here.
#[tauri::command]
pub async fn start_aprs_is_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    call_sign: String,
    lat: f64,
    lon: f64,
    radius_km: u32,
) -> Result<(), String> {
    if crate::net::working_offline() {
        return Err(crate::net::WORKING_OFFLINE_MESSAGE.to_string());
    }
    if call_sign.trim().is_empty() {
        return Err(
            "A call sign is required to connect to APRS-IS — focus an operator with one set."
                .to_string(),
        );
    }
    if let Some(existing) = state.aprs_is_stream.lock().unwrap().take() {
        existing.stop();
    }
    let handle = aprs_is::start_stream(app, call_sign, lat, lon, radius_km).await?;
    *state.aprs_is_stream.lock().unwrap() = Some(handle);
    Ok(())
}

#[tauri::command]
pub fn stop_aprs_is_stream(state: State<'_, AppState>) -> Result<(), String> {
    if let Some(existing) = state.aprs_is_stream.lock().unwrap().take() {
        existing.stop();
    }
    Ok(())
}
