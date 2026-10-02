use super::{AppState, ERR_OFFLINE};
use crate::datapacks::{self, PackInfo};
use crate::net::FetchError;
use crate::routes::{self, MileMarkerHit};
use tauri::State;

#[tauri::command]
pub fn list_data_packs(state: State<'_, AppState>) -> Result<Vec<PackInfo>, String> {
    let packs = state.route_packs.lock().unwrap();
    Ok(packs
        .iter()
        .map(|(p, downloaded)| datapacks::info_for(p, *downloaded))
        .collect())
}

/// Downloads the latest mile-marker data for one road straight from the
/// public source (needs internet; a few small requests, and it gives up
/// within a minute), builds a fresh pack from it, and swaps it in. The
/// installed data stays untouched if anything goes wrong or the new data
/// looks off.
#[tauri::command]
pub async fn update_data_pack(state: State<'_, AppState>, id: String) -> Result<PackInfo, String> {
    let def = datapacks::find_def(&id).ok_or_else(|| format!("Unknown data pack: {id}"))?;
    let pack = match datapacks::build_pack(def, datapacks::UPDATE_TIMEOUT).await {
        Ok(p) => p,
        Err(FetchError::Offline) => return Err(ERR_OFFLINE.to_string()),
        Err(FetchError::Other(e)) => return Err(e),
    };
    let mut packs = state.route_packs.lock().unwrap();
    datapacks::install_update(&state.datapacks_dir, &mut packs, pack)
}

/// Resolves text like "mile marker 182 on the turnpike" to coordinates,
/// entirely from the local data packs (no network). `None` when the text
/// isn't a recognizable mile-marker reference for a road we have data for.
#[tauri::command]
pub fn resolve_mile_marker(
    state: State<'_, AppState>,
    text: String,
) -> Result<Option<MileMarkerHit>, String> {
    let packs: Vec<_> = state
        .route_packs
        .lock()
        .unwrap()
        .iter()
        .map(|(p, _)| p.clone())
        .collect();
    Ok(routes::resolve(&packs, &text))
}
