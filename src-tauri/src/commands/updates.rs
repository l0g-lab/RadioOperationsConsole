use super::AppState;
use crate::net::{self, FetchError};
use crate::updates::{self, Opened, UpdateInfo};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

fn explain(e: FetchError) -> String {
    match e {
        FetchError::Offline if net::working_offline() => net::WORKING_OFFLINE_MESSAGE.to_string(),
        FetchError::Offline => "Couldn't reach GitHub — check the internet connection.".to_string(),
        FetchError::Other(m) => m,
    }
}

/// Looks for a newer release. The installer it finds for this computer is
/// remembered here, so downloading and opening can only ever act on that file.
#[tauri::command]
pub async fn check_for_update(state: State<'_, AppState>) -> Result<Option<UpdateInfo>, String> {
    let found = updates::check().await.map_err(explain)?;
    *state.update_installer.lock().unwrap() = found.as_ref().and_then(|u| u.installer.clone());
    *state.update_download.lock().unwrap() = None;
    Ok(found)
}

#[derive(Serialize, Clone)]
struct Progress {
    received: u64,
    total: u64,
}

/// Downloads the installer the last check found into the Downloads folder,
/// sending "update-progress" events. Returns where it was saved.
#[tauri::command]
pub async fn download_update(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let asset = state
        .update_installer
        .lock()
        .unwrap()
        .clone()
        .ok_or("There's no update to download. Check for updates first.")?;
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().temp_dir())
        .map_err(|e| e.to_string())?;
    let emit = |received: u64, total: u64| {
        let _ = app.emit("update-progress", Progress { received, total });
    };
    let path = updates::download(&asset, &dir, &emit).await.map_err(explain)?;
    *state.update_download.lock().unwrap() = Some(path.clone());
    Ok(path.to_string_lossy().into_owned())
}

/// Opens the downloaded installer. A Windows installer needs this app closed
/// to replace it, so the app closes a moment after starting it.
#[tauri::command]
pub fn open_update_installer(app: AppHandle, state: State<AppState>) -> Result<Opened, String> {
    let path = state
        .update_download
        .lock()
        .unwrap()
        .clone()
        .ok_or("The update hasn't been downloaded yet.")?;
    let opened = updates::open_installer(&path)?;
    if opened == Opened::InstallerRunning {
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            app.exit(0);
        });
    }
    Ok(opened)
}
