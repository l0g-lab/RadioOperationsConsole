use super::{AppState, ERR_OFFLINE};
use crate::callsigns::{self, CallRecord, Service};
use crate::net::FetchError;
use serde::Serialize;
use std::collections::hash_map::Entry;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Clone, Debug)]
pub struct CallPackStatus {
    pub installed: bool,
    pub record_count: u32,
    pub generated_at: String,
    pub source: String,
    pub size_bytes: u64,
    /// False for a file downloaded before street addresses were included.
    pub has_street_addresses: bool,
}

#[derive(Serialize, Clone)]
struct ProgressEvent {
    id: &'static str,
    phase: &'static str,
    done: u64,
    total: u64,
}

fn status_from_disk(state: &AppState, service: Service) -> CallPackStatus {
    let path = state.datapacks_dir.join(service.pack_file());
    match callsigns::read_info(&path) {
        Some(info) => CallPackStatus {
            installed: true,
            record_count: info.record_count,
            generated_at: info.generated_at,
            source: info.source,
            size_bytes: std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0),
            has_street_addresses: info.version >= 2,
        },
        None => CallPackStatus {
            installed: false,
            record_count: 0,
            generated_at: String::new(),
            source: String::new(),
            size_bytes: 0,
            has_street_addresses: false,
        },
    }
}

/// Is this service's offline directory downloaded, and how big/new is it?
/// Reads only the file's header, so this is instant.
#[tauri::command]
pub fn callsign_pack_status(state: State<'_, AppState>, service: Service) -> Result<CallPackStatus, String> {
    Ok(status_from_disk(&state, service))
}

/// Downloads the FCC's license database for one service (a large file — it
/// says so in Settings first) and builds that offline directory from it.
/// Progress arrives as `datapack-progress` events. A download that's cut off
/// keeps what it got, and running this again resumes it.
#[tauri::command]
pub async fn update_callsign_pack(
    app: AppHandle,
    state: State<'_, AppState>,
    service: Service,
) -> Result<CallPackStatus, String> {
    if state.callsign_update_running.swap(true, Ordering::SeqCst) {
        return Err("A call-sign download is already running. Try again when it finishes.".into());
    }
    state.callsign_update_cancel.store(false, Ordering::SeqCst);
    let result = run_update(&app, &state, service).await;
    state.callsign_update_running.store(false, Ordering::SeqCst);
    result
}

async fn run_update(app: &AppHandle, state: &AppState, service: Service) -> Result<CallPackStatus, String> {
    // Emit at most ~5 times a second so a fast download doesn't flood the UI.
    let last_emit = Arc::new(AtomicU64::new(0));
    let started = std::time::Instant::now();
    let handle = app.clone();
    let progress: callsigns::ProgressFn = Arc::new(move |phase, done, total| {
        let now = started.elapsed().as_millis() as u64;
        let finished_phase = total > 0 && done >= total;
        if !finished_phase && now.saturating_sub(last_emit.load(Ordering::Relaxed)) < 200 && done != 0 {
            return;
        }
        last_emit.store(now, Ordering::Relaxed);
        let _ = handle.emit("datapack-progress", ProgressEvent { id: service.pack_id(), phase, done, total });
    });

    let cancelled = || state.callsign_update_cancel.load(Ordering::SeqCst);
    let db = match callsigns::build_and_install(service, service.url(), &state.datapacks_dir, progress, &cancelled).await {
        Ok(db) => db,
        Err(FetchError::Offline) => return Err(ERR_OFFLINE.to_string()),
        Err(FetchError::Other(e)) => return Err(e),
    };
    state.callsign_dbs.lock().unwrap().insert(service, Arc::new(db));
    Ok(status_from_disk(state, service))
}

/// Stops the running call-sign download, keeping what has arrived so the
/// next download resumes (CALLDIR-037). Does nothing if none is running.
#[tauri::command]
pub fn cancel_callsign_download(state: State<'_, AppState>) {
    if state.callsign_update_running.load(Ordering::SeqCst) {
        state.callsign_update_cancel.store(true, Ordering::SeqCst);
    }
}

#[tauri::command]
pub fn remove_callsign_pack(state: State<'_, AppState>, service: Service) -> Result<CallPackStatus, String> {
    let _ = std::fs::remove_file(state.datapacks_dir.join(service.pack_file()));
    state.callsign_dbs.lock().unwrap().remove(&service);
    Ok(status_from_disk(&state, service))
}

#[derive(Serialize)]
pub struct OfflineCallLookup {
    /// False when the directory hasn't been downloaded, so "not found"
    /// isn't confused with "there's nothing to search".
    pub installed: bool,
    pub record: Option<CallRecord>,
    /// False when the file was downloaded before street addresses were
    /// included, so an empty street means "update the file", not "none on record".
    pub has_street_addresses: bool,
}

/// Looks a call sign up in one service's offline directory. Loads the file
/// on first use (a fraction of a second), then it's just a search in memory.
#[tauri::command]
pub fn lookup_callsign_offline(
    state: State<'_, AppState>,
    call_sign: String,
    service: Service,
) -> Result<OfflineCallLookup, String> {
    let mut dbs = state.callsign_dbs.lock().unwrap();
    let db = match dbs.entry(service) {
        Entry::Occupied(e) => Some(e.into_mut()),
        Entry::Vacant(e) => {
            let path = state.datapacks_dir.join(service.pack_file());
            let loaded = path.exists().then(|| callsigns::load_file(&path).ok()).flatten();
            loaded.map(|db| e.insert(Arc::new(db)))
        }
    };
    Ok(match db {
        Some(db) => OfflineCallLookup {
            installed: true,
            record: db.lookup(&call_sign),
            has_street_addresses: db.info.version >= 2,
        },
        None => OfflineCallLookup { installed: false, record: None, has_street_addresses: false },
    })
}
