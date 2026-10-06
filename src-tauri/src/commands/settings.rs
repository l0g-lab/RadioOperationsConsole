use super::{persist_settings, AppSettings, AppState};
use tauri::State;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> AppSettings {
    state.settings.lock().unwrap().clone()
}

/// What the Settings tab's Save writes: its fields, but the current
/// working-offline choice, since the form holds a copy loaded earlier and
/// that switch lives in the header (UX-025).
fn for_save(current: &AppSettings, incoming: AppSettings) -> AppSettings {
    AppSettings {
        work_offline: current.work_offline,
        ..incoming
    }
}

#[tauri::command]
pub fn save_settings(state: State<AppState>, settings: AppSettings) -> Result<(), String> {
    let current = state.settings.lock().unwrap().clone();
    let merged = for_save(&current, settings);
    // New QRZ credentials: the session from the old ones mustn't be reused.
    if merged.qrz_username != current.qrz_username || merged.qrz_password != current.qrz_password {
        *state.qrz_session.lock().unwrap() = None;
    }
    persist_settings(&state, &merged)
}

/// Turns "Work offline" on or off (UX-020), remembering it across restarts
/// (UX-024). Going offline stops a running APRS-IS feed (UX-023); a download
/// in progress notices and stops itself. Going online requests nothing (UX-026).
#[tauri::command]
pub fn set_work_offline(state: State<AppState>, on: bool) -> Result<(), String> {
    let mut settings = state.settings.lock().unwrap().clone();
    settings.work_offline = on;
    persist_settings(&state, &settings)?;
    crate::net::set_work_offline(on);
    if on {
        if let Some(stream) = state.aprs_is_stream.lock().unwrap().take() {
            stream.stop();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saving_settings_keeps_the_working_offline_choice() {
        let current = AppSettings {
            work_offline: true,
            ..Default::default()
        };
        let incoming = AppSettings {
            qrz_username: "me".into(),
            work_offline: false,
            ..Default::default()
        };
        let merged = for_save(&current, incoming);
        assert_eq!(merged.qrz_username, "me");
        assert!(
            merged.work_offline,
            "the Settings form's stale copy doesn't turn it off"
        );
    }

    #[test]
    fn older_settings_files_load_as_online() {
        let s: AppSettings = serde_json::from_str("{\"qrz_username\":\"me\"}").unwrap();
        assert!(!s.work_offline);
    }
}
