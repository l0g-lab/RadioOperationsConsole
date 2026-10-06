use super::{AppState, ERR_OFFLINE};
use crate::connectors;
use serde::Serialize;
use tauri::State;

#[derive(Serialize, Debug, Clone)]
pub struct QrzLookupResponse {
    pub call_sign: String,
    pub name: Option<String>,
    pub qth_location: Option<String>,
    pub grid_square: Option<String>,
    pub address: Option<String>,
    pub exact_lat: Option<f64>,
    pub exact_lon: Option<f64>,
    pub geoloc: Option<String>,
}

/// Stable error sentinel the frontend matches on to stay silent when QRZ
/// simply isn't configured (QRZ-003), rather than showing a spurious error.
pub const QRZ_ERR_NOT_CONFIGURED: &str = "not_configured";

/// Tries logging in to QRZ with the saved username and password, for the
/// Settings tab's Check button (QRZ-040): Ok when QRZ accepts them, else why
/// not (QRZ's own reason, or offline). A good login's session is kept for
/// lookups.
#[tauri::command]
pub async fn check_qrz_login(state: State<'_, AppState>) -> Result<(), String> {
    let (username, password) = {
        let settings = state.settings.lock().unwrap();
        (settings.qrz_username.clone(), settings.qrz_password.clone())
    };
    if username.is_empty() || password.is_empty() {
        return Err("Enter your QRZ username and password first.".to_string());
    }
    match connectors::qrz_login(&username, &password).await {
        connectors::QrzLoginOutcome::Ok(key) => {
            *state.qrz_session.lock().unwrap() = Some(key);
            Ok(())
        }
        connectors::QrzLoginOutcome::Offline => Err(ERR_OFFLINE.to_string()),
        connectors::QrzLoginOutcome::Error(e) => Err(e),
    }
}

#[tauri::command]
pub async fn lookup_qrz_callsign(
    state: State<'_, AppState>,
    call_sign: String,
) -> Result<Option<QrzLookupResponse>, String> {
    let (username, password) = {
        let settings = state.settings.lock().unwrap();
        (settings.qrz_username.clone(), settings.qrz_password.clone())
    };
    if username.is_empty() || password.is_empty() {
        return Err(QRZ_ERR_NOT_CONFIGURED.to_string());
    }

    let mut session_key = state.qrz_session.lock().unwrap().clone();
    if session_key.is_none() {
        match connectors::qrz_login(&username, &password).await {
            connectors::QrzLoginOutcome::Ok(key) => {
                *state.qrz_session.lock().unwrap() = Some(key.clone());
                session_key = Some(key);
            }
            connectors::QrzLoginOutcome::Offline => return Err(ERR_OFFLINE.to_string()),
            connectors::QrzLoginOutcome::Error(e) => return Err(e),
        }
    }

    let mut outcome = connectors::qrz_lookup(session_key.as_ref().unwrap(), &call_sign).await;
    if matches!(outcome, connectors::QrzLookupOutcome::SessionExpired) {
        match connectors::qrz_login(&username, &password).await {
            connectors::QrzLoginOutcome::Ok(key) => {
                *state.qrz_session.lock().unwrap() = Some(key.clone());
                outcome = connectors::qrz_lookup(&key, &call_sign).await;
            }
            connectors::QrzLoginOutcome::Offline => return Err(ERR_OFFLINE.to_string()),
            connectors::QrzLoginOutcome::Error(e) => return Err(e),
        }
    }

    match outcome {
        connectors::QrzLookupOutcome::Found(info) => Ok(Some(QrzLookupResponse {
            call_sign: info.call,
            name: info.name,
            qth_location: info.qth_location,
            grid_square: info.grid_square,
            address: info.address,
            exact_lat: info.exact_lat,
            exact_lon: info.exact_lon,
            geoloc: info.geoloc,
        })),
        connectors::QrzLookupOutcome::NotFound => Ok(None),
        connectors::QrzLookupOutcome::Offline => Err(ERR_OFFLINE.to_string()),
        connectors::QrzLookupOutcome::SessionExpired => Err("QRZ session expired".to_string()),
        connectors::QrzLookupOutcome::Error(e) => Err(e),
    }
}
