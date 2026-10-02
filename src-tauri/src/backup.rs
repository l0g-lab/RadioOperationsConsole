//! Whole-database backup and restore.
//!
//! A backup is a single, self-contained SQLite file (made with `VACUUM INTO`,
//! so it's consistent even while the app is running). Restoring copies a
//! backup's contents over the live database with SQLite's online-backup API,
//! after first saving a copy of what's there now, so a restore can be undone.

use crate::db;
use chrono::{DateTime, Utc};
use rusqlite::{backup::Backup, Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// How many "before restore" (and, separately, "before upgrade") safety
/// copies to keep.
const KEEP_SAFETY_COPIES: usize = 5;

/// What's inside a backup file, shown before restoring it.
#[derive(Serialize, Debug, Clone)]
pub struct BackupSummary {
    pub operators: i64,
    pub activities: i64,
    pub checkins: i64,
    pub spotter_reports: i64,
    pub size_bytes: u64,
    /// When the file was last written (RFC 3339), or empty if unknown.
    pub modified: String,
}

fn count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
        .unwrap_or(0)
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

/// Opens `path` read-only and checks that it's one of this app's databases,
/// not written by a newer version. Returns what it contains.
pub fn inspect(path: &Path) -> Result<BackupSummary, String> {
    if !path.is_file() {
        return Err("That file doesn't exist.".into());
    }
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| "That isn't a Radio Operations Console backup.".to_string())?;
    let not_ours = || "That isn't a Radio Operations Console backup.".to_string();

    // A non-database file fails on the first real query.
    let versions: Vec<String> = conn
        .prepare("SELECT version FROM schema_migrations")
        .and_then(|mut s| s.query_map([], |r| r.get(0))?.collect())
        .map_err(|_| not_ours())?;
    for table in ["operators", "activities", "checkins", "spotter_reports"] {
        conn.query_row(&format!("SELECT 1 FROM {table} LIMIT 1"), [], |_| Ok(()))
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(()),
                _ => Err(not_ours()),
            })?;
    }
    if versions.iter().any(|v| !db::is_known_migration(v)) {
        return Err(
            "This backup was made by a newer version of the app. Update the app before restoring it."
                .into(),
        );
    }

    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = meta
        .modified()
        .ok()
        .map(|t| DateTime::<Utc>::from(t).to_rfc3339())
        .unwrap_or_default();
    Ok(BackupSummary {
        operators: count(&conn, "operators"),
        activities: count(&conn, "activities"),
        checkins: count(&conn, "checkins"),
        spotter_reports: count(&conn, "spotter_reports"),
        size_bytes: meta.len(),
        modified,
    })
}

/// Writes a consistent copy of the live database to `dest` (replacing a file
/// already there, which the user has confirmed in the save dialog).
pub fn create_backup(live: &Connection, dest: &Path) -> Result<BackupSummary, String> {
    if let Some(live_path) = live.path() {
        if same_file(Path::new(live_path), dest) {
            return Err("Choose a different file — that's the app's own database.".into());
        }
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if dest.exists() {
        std::fs::remove_file(dest).map_err(|e| format!("Couldn't replace that file: {e}"))?;
    }
    live.execute("VACUUM INTO ?1", [dest.to_string_lossy()])
        .map_err(|e| format!("Backup failed: {e}"))?;
    inspect(dest)
}

fn prune_safety_copies(dir: &Path, prefix: &str) {
    let Ok(read) = std::fs::read_dir(dir) else { return };
    let mut files: Vec<PathBuf> = read
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with(prefix) && n.ends_with(".db"))
                .unwrap_or(false)
        })
        .collect();
    files.sort(); // timestamped names sort oldest-first
    while files.len() > KEEP_SAFETY_COPIES {
        let _ = std::fs::remove_file(files.remove(0));
    }
}

/// Replaces the live database's contents with the backup at `src`. The current
/// contents are saved under `safety_dir` first; on success returns that copy's
/// path. If anything fails before the copy starts, nothing has changed.
pub fn restore_backup(
    live: &mut Connection,
    src: &Path,
    safety_dir: &Path,
) -> Result<PathBuf, String> {
    inspect(src)?;
    if let Some(live_path) = live.path() {
        if same_file(Path::new(live_path), src) {
            return Err("That's the app's own database, not a backup.".into());
        }
    }

    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let safety = safety_dir.join(format!("before-restore-{stamp}.db"));
    create_backup(live, &safety)?;

    let source = Connection::open_with_flags(src, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())?;
    {
        let backup = Backup::new(&source, live).map_err(|e| format!("Restore failed: {e}"))?;
        backup
            .run_to_completion(256, Duration::from_millis(0), None)
            .map_err(|e| format!("Restore failed: {e}"))?;
    }
    // A backup from an older version may lack newer tables.
    db::run_migrations(live).map_err(|e| format!("Restored, but updating it failed: {e}"))?;
    let _ = live.pragma_update(None, "foreign_keys", "ON");
    let _ = live.pragma_update(None, "journal_mode", "WAL");

    prune_safety_copies(safety_dir, "before-restore-");
    Ok(safety)
}

/// Saves a copy of the database as it is before this version upgrades it,
/// under `dir`, keeping the newest few. Returns the copy's path.
pub fn save_before_upgrade(live: &Connection, dir: &Path) -> Result<PathBuf, String> {
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let copy = dir.join(format!("before-upgrade-{stamp}.db"));
    if let Some(parent) = copy.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if copy.exists() {
        std::fs::remove_file(&copy).map_err(|e| e.to_string())?;
    }
    // Not `create_backup`: that checks the copy is one this version can
    // restore, and an older database may lack tables it looks for.
    live.execute("VACUUM INTO ?1", [copy.to_string_lossy()])
        .map_err(|e| format!("Couldn't save a copy before upgrading: {e}"))?;
    prune_safety_copies(dir, "before-upgrade-");
    Ok(copy)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::Repository;
    use uuid::Uuid;

    fn temp(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("roc-bk-{}-{name}", Uuid::new_v4()))
    }

    fn repo() -> (Repository, PathBuf) {
        let path = temp("live.db");
        (Repository::new(db::open_db(&path).unwrap()), path)
    }

    #[test]
    fn backup_then_restore_brings_back_the_old_data() {
        let (mut r, _live_path) = repo();
        r.create_activity("First Net", "weekly_net", Some("2026-01-01"), None)
            .unwrap();

        let file = temp("backup.db");
        let summary = create_backup(&r.conn, &file).unwrap();
        assert_eq!(summary.activities, 1);

        // Changes made after the backup...
        r.create_activity("Second Net", "weekly_net", Some("2026-01-02"), None)
            .unwrap();
        assert_eq!(count(&r.conn, "activities"), 2);

        // ...are undone by restoring, and a safety copy of them is kept.
        let safety_dir = temp("safety");
        let safety = restore_backup(&mut r.conn, &file, &safety_dir).unwrap();
        assert_eq!(count(&r.conn, "activities"), 1);
        assert_eq!(inspect(&safety).unwrap().activities, 2);
        // The live connection still works normally afterwards.
        r.create_activity("Third Net", "weekly_net", Some("2026-01-03"), None)
            .unwrap();
        assert_eq!(count(&r.conn, "activities"), 2);
    }

    #[test]
    fn overwriting_an_existing_backup_file_works() {
        let (r, _) = repo();
        let file = temp("again.db");
        create_backup(&r.conn, &file).unwrap();
        r.create_activity("Net", "weekly_net", None, None).unwrap();
        assert_eq!(create_backup(&r.conn, &file).unwrap().activities, 1);
    }

    #[test]
    fn refuses_files_that_are_not_backups() {
        let junk = temp("junk.db");
        std::fs::write(&junk, b"this is not a database at all").unwrap();
        assert!(inspect(&junk).is_err());
        assert!(inspect(&temp("missing.db")).is_err());

        // A real SQLite file that isn't ours.
        let other = temp("other.db");
        Connection::open(&other)
            .unwrap()
            .execute("CREATE TABLE unrelated (x INTEGER)", [])
            .unwrap();
        assert!(inspect(&other).is_err());

        let (mut r, _) = repo();
        r.create_activity("Keep me", "weekly_net", None, None)
            .unwrap();
        assert!(restore_backup(&mut r.conn, &junk, &temp("safety")).is_err());
        assert_eq!(
            count(&r.conn, "activities"),
            1,
            "a refused restore changes nothing"
        );
    }

    #[test]
    fn refuses_a_backup_from_a_newer_version() {
        let (r, _) = repo();
        let file = temp("newer.db");
        create_backup(&r.conn, &file).unwrap();
        Connection::open(&file)
            .unwrap()
            .execute(
                "INSERT INTO schema_migrations(version, applied_at) VALUES('9999_from_the_future.sql', 'now')",
                [],
            )
            .unwrap();
        let err = inspect(&file).unwrap_err();
        assert!(err.contains("newer version"), "{err}");
    }

    #[test]
    fn will_not_back_up_onto_or_restore_from_itself() {
        let (mut r, live_path) = repo();
        assert!(create_backup(&r.conn, &live_path).is_err());
        assert!(restore_backup(&mut r.conn, &live_path, &temp("safety")).is_err());
    }

    #[test]
    fn keeps_only_the_newest_safety_copies() {
        let dir = temp("prune");
        std::fs::create_dir_all(&dir).unwrap();
        for i in 0..8 {
            std::fs::write(
                dir.join(format!("before-restore-2026010{i}-000000.db")),
                b"x",
            )
            .unwrap();
        }
        std::fs::write(dir.join("keep-me.txt"), b"x").unwrap();
        prune_safety_copies(&dir, "before-restore-");
        let left = std::fs::read_dir(&dir).unwrap().count();
        assert_eq!(left, KEEP_SAFETY_COPIES + 1);
        assert!(dir.join("keep-me.txt").exists());
        assert!(!dir.join("before-restore-20260100-000000.db").exists());
    }
}
