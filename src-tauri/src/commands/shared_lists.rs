use super::AppState;
use crate::shared_lists::{self, ImportSummary, Kind};
use std::path::Path;
use tauri::State;

/// Writes the repeaters or the nets in use to a list file at `path` to share
/// (`kind` is "repeaters" or "nets"). Returns how many were written.
#[tauri::command]
pub fn export_list(state: State<AppState>, kind: String, path: String) -> Result<usize, String> {
    let repo = state.repo.lock().unwrap();
    shared_lists::export(&repo, Path::new(&path), Kind::parse(&kind)?)
}

/// What importing the list file at `path` would add, without changing anything.
#[tauri::command]
pub fn inspect_list(state: State<AppState>, kind: String, path: String) -> Result<ImportSummary, String> {
    let repo = state.repo.lock().unwrap();
    shared_lists::inspect(&repo, Path::new(&path), Kind::parse(&kind)?)
}

/// Adds the entries in the list file at `path` that aren't here yet.
#[tauri::command]
pub fn import_list(
    state: State<AppState>,
    kind: String,
    path: String,
    operator_id: Option<String>,
) -> Result<ImportSummary, String> {
    let repo = state.repo.lock().unwrap();
    shared_lists::import(&repo, Path::new(&path), Kind::parse(&kind)?, operator_id.as_deref())
}
