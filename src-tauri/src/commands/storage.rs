use super::AppState;
use crate::callsigns::Service;
use crate::storage::{self, StorageItem};
use std::sync::atomic::Ordering;
use tauri::State;

fn dirs_of(state: &AppState) -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
    let restore_copies = super::backup::safety_dir(&state.repo.lock().unwrap())?;
    Ok((state.datapacks_dir.clone(), restore_copies))
}

/// Sizes of everything kept on this computer besides the records (STORE-001,
/// STORE-002). Async, so measuring never holds up the interface (STORE-007).
#[tauri::command]
pub async fn storage_usage(state: State<'_, AppState>) -> Result<Vec<StorageItem>, String> {
    let (datapacks, restore_copies) = dirs_of(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        storage::usage(&storage::Dirs { datapacks: &datapacks, restore_copies: &restore_copies })
    })
    .await
    .map_err(|e| e.to_string())
}

/// Clears one item and puts what's in memory in step with the disk
/// (STORE-004): a cleared call-sign file stops answering lookups, and cleared
/// road data falls back to the built-in copy.
#[tauri::command]
pub fn clear_storage(state: State<'_, AppState>, id: String) -> Result<Vec<StorageItem>, String> {
    let touches_downloads = matches!(id.as_str(), "callsigns-amateur" | "callsigns-gmrs" | "partial-downloads");
    if touches_downloads && state.callsign_update_running.load(Ordering::SeqCst) {
        return Err("A call-sign download is running. Clear this once it finishes.".into());
    }
    let (datapacks, restore_copies) = dirs_of(&state)?;
    let dirs = storage::Dirs { datapacks: &datapacks, restore_copies: &restore_copies };
    storage::clear(&id, &dirs)?;
    match id.as_str() {
        "callsigns-amateur" => {
            state.callsign_dbs.lock().unwrap().remove(&Service::Amateur);
        }
        "callsigns-gmrs" => {
            state.callsign_dbs.lock().unwrap().remove(&Service::Gmrs);
        }
        "road-data" => {
            *state.route_packs.lock().unwrap() = crate::datapacks::load_all(&datapacks);
        }
        _ => {}
    }
    Ok(storage::usage(&dirs))
}
