use super::AppState;
use crate::backup::{self, BackupSummary};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::State;

#[derive(Serialize)]
pub struct RestoreResult {
    /// Where the data that was replaced was saved, in case the restore was a mistake.
    pub safety_copy: String,
    pub summary: BackupSummary,
}

/// Where "before restore" safety copies are kept: `backups/` next to the database.
pub(super) fn safety_dir(repo: &crate::repo::Repository) -> Result<PathBuf, String> {
    repo.conn
        .path()
        .map(|p| Path::new(p).parent().unwrap_or(Path::new(".")).join("backups"))
        .ok_or_else(|| "Couldn't find the database folder.".to_string())
}

/// Writes a backup of the whole database to `path`.
#[tauri::command]
pub fn backup_database(state: State<AppState>, path: String) -> Result<BackupSummary, String> {
    let repo = state.repo.lock().unwrap();
    backup::create_backup(&repo.conn, Path::new(&path))
}

/// Reads a backup file's contents (without changing anything) so they can be
/// shown before the user commits to restoring it.
#[tauri::command]
pub fn inspect_backup(path: String) -> Result<BackupSummary, String> {
    backup::inspect(Path::new(&path))
}

/// Replaces everything in the app with the backup at `path`, after saving the
/// current data next to the database.
#[tauri::command]
pub fn restore_database(state: State<AppState>, path: String) -> Result<RestoreResult, String> {
    let mut repo = state.repo.lock().unwrap();
    let safety_dir = safety_dir(&repo)?;
    let summary = backup::inspect(Path::new(&path))?;
    let safety = backup::restore_backup(&mut repo.conn, Path::new(&path), &safety_dir)?;
    Ok(RestoreResult {
        safety_copy: safety.to_string_lossy().into_owned(),
        summary,
    })
}
