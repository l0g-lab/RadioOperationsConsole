use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::error::Error;
use std::path::Path;

const MIGRATIONS: &[(&str, &str)] = &[
    (
        "0001_create_core.sql",
        include_str!("../migrations/0001_create_core.sql"),
    ),
    (
        "0002_add_activity_date.sql",
        include_str!("../migrations/0002_add_activity_date.sql"),
    ),
    (
        "0003_soft_delete.sql",
        include_str!("../migrations/0003_soft_delete.sql"),
    ),
    (
        "0004_checkin_qth.sql",
        include_str!("../migrations/0004_checkin_qth.sql"),
    ),
    (
        "0005_checkin_address.sql",
        include_str!("../migrations/0005_checkin_address.sql"),
    ),
    (
        "0006_activity_frequency.sql",
        include_str!("../migrations/0006_activity_frequency.sql"),
    ),
    (
        "0007_operator_location.sql",
        include_str!("../migrations/0007_operator_location.sql"),
    ),
    (
        "0008_activity_location.sql",
        include_str!("../migrations/0008_activity_location.sql"),
    ),
    (
        "0009_spotter_reports.sql",
        include_str!("../migrations/0009_spotter_reports.sql"),
    ),
    (
        "0010_spotter_report_checkin_link.sql",
        include_str!("../migrations/0010_spotter_report_checkin_link.sql"),
    ),
    (
        "0011_checkin_location.sql",
        include_str!("../migrations/0011_checkin_location.sql"),
    ),
    (
        "0012_drop_dead_location_fields.sql",
        include_str!("../migrations/0012_drop_dead_location_fields.sql"),
    ),
    (
        "0013_activity_templates.sql",
        include_str!("../migrations/0013_activity_templates.sql"),
    ),
    (
        "0014_activity_lifecycle.sql",
        include_str!("../migrations/0014_activity_lifecycle.sql"),
    ),
    (
        "0015_checkin_traffic.sql",
        include_str!("../migrations/0015_checkin_traffic.sql"),
    ),
    (
        "0016_activity_types.sql",
        include_str!("../migrations/0016_activity_types.sql"),
    ),
    (
        "0017_operator_retired.sql",
        include_str!("../migrations/0017_operator_retired.sql"),
    ),
    (
        "0018_contact_details.sql",
        include_str!("../migrations/0018_contact_details.sql"),
    ),
    (
        "0019_range_check.sql",
        include_str!("../migrations/0019_range_check.sql"),
    ),
];

/// Whether this build knows the migration, i.e. a database that has it wasn't
/// made by a newer version of the app.
pub fn is_known_migration(version: &str) -> bool {
    MIGRATIONS.iter().any(|(v, _)| *v == version)
}

/// What happened to the copy saved before this launch's upgrade, if there was one.
#[derive(serde::Serialize, Debug, Clone, PartialEq)]
pub struct UpgradeBackup {
    /// Where the copy was saved, or None if saving it failed.
    pub path: Option<String>,
    /// Why it couldn't be saved; the upgrade still went ahead.
    pub error: Option<String>,
}

#[cfg(test)]
pub fn open_db(path: &Path) -> Result<Connection, Box<dyn Error>> {
    Ok(open_db_with_upgrade_backup(path, None)?.0)
}

/// Opens the database and brings it up to date. When an existing database
/// needs upgrading and `backup_dir` is given, a copy of it is saved there
/// first. A brand-new database has nothing to save.
pub fn open_db_with_upgrade_backup(
    path: &Path,
    backup_dir: Option<&Path>,
) -> Result<(Connection, Option<UpgradeBackup>), Box<dyn Error>> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path).map_err(Box::<dyn Error>::from)?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(Box::<dyn Error>::from)?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(Box::<dyn Error>::from)?;
    // Deleted content is overwritten rather than left in free pages, so a
    // permanent delete really erases names and addresses (AUDIT-009).
    conn.pragma_update(None, "secure_delete", "ON")
        .map_err(Box::<dyn Error>::from)?;
    let mut saved = None;
    if let Some(dir) = backup_dir {
        if has_data(&conn) && !pending_migrations(&conn)?.is_empty() {
            saved = Some(match crate::backup::save_before_upgrade(&conn, dir) {
                Ok(p) => UpgradeBackup { path: Some(p.to_string_lossy().into_owned()), error: None },
                Err(e) => UpgradeBackup { path: None, error: Some(e) },
            });
        }
    }
    run_migrations(&conn)?;
    Ok((conn, saved))
}

/// Whether this is an existing database (it has had migrations), as opposed
/// to one just created.
fn has_data(conn: &Connection) -> bool {
    conn.query_row("SELECT COUNT(*) FROM schema_migrations", [], |r| r.get::<_, i64>(0))
        .map(|n| n > 0)
        .unwrap_or(false)
}

/// The migrations this database hasn't had yet, in order.
pub fn pending_migrations(conn: &Connection) -> Result<Vec<&'static str>, Box<dyn Error>> {
    let applied: std::collections::HashSet<String> = match conn
        .prepare("SELECT version FROM schema_migrations")
    {
        Ok(mut stmt) => stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?,
        // No table yet: nothing has been applied.
        Err(_) => Default::default(),
    };
    Ok(MIGRATIONS
        .iter()
        .map(|(v, _)| *v)
        .filter(|v| !applied.contains(*v))
        .collect())
}

pub fn run_migrations(conn: &Connection) -> Result<(), Box<dyn Error>> {
    apply_migrations(conn, MIGRATIONS)
}

fn apply_migrations(conn: &Connection, migrations: &[(&str, &str)]) -> Result<(), Box<dyn Error>> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
        [],
    )?;

    for (version, sql) in migrations {
        let already: Option<String> = conn
            .query_row(
                "SELECT version FROM schema_migrations WHERE version = ?1",
                params![version],
                |r| r.get(0),
            )
            .optional()?;

        if already.is_some() {
            continue;
        }

        // All or nothing: a migration that fails partway (a full disk, a
        // crash) leaves the database as it was, so the next launch can simply
        // try it again. SQLite rolls back schema changes too.
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        let now = Utc::now().to_rfc3339();
        tx.execute(
            "INSERT INTO schema_migrations(version, applied_at) VALUES(?1, ?2)",
            params![version, now],
        )?;
        tx.commit()?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("roc-db-{}-{name}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn a_migration_that_fails_partway_leaves_nothing_behind() {
        let conn = Connection::open_in_memory().unwrap();
        let broken = [("x.sql", "CREATE TABLE t (a TEXT); ALTER TABLE t ADD COLUMN b TEXT; NOT SQL;")];
        assert!(apply_migrations(&conn, &broken).is_err());
        let tables: i64 = conn
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE name = 't'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(tables, 0, "the half-done migration was rolled back");
        assert_eq!(pending_migrations(&conn).unwrap().len(), MIGRATIONS.len());

        // Fixed, it applies cleanly on the next try instead of tripping over leftovers.
        let fixed = [("x.sql", "CREATE TABLE t (a TEXT); ALTER TABLE t ADD COLUMN b TEXT;")];
        apply_migrations(&conn, &fixed).unwrap();
        conn.execute("INSERT INTO t (a, b) VALUES ('1', '2')", []).unwrap();
    }

    #[test]
    fn upgrading_an_existing_database_saves_a_copy_first() {
        let path = temp_db("live.db");
        let backups = temp_db("backups");
        {
            // A database from the version before the last migration, with data in it.
            let conn = Connection::open(&path).unwrap();
            apply_migrations(&conn, &MIGRATIONS[..MIGRATIONS.len() - 1]).unwrap();
            conn.execute(
                "INSERT INTO activities(id, title, type, state, created_at) VALUES ('a1', 'Tuesday Net', 'directed_net', 'scheduled', 't')",
                [],
            )
            .unwrap();
        }

        let (_conn, saved) = open_db_with_upgrade_backup(&path, Some(&backups)).unwrap();
        let saved = saved.expect("an upgrade saves a copy");
        assert_eq!(saved.error, None);
        let copy = Connection::open(saved.path.unwrap()).unwrap();
        let title: String = copy.query_row("SELECT title FROM activities", [], |r| r.get(0)).unwrap();
        assert_eq!(title, "Tuesday Net");
        assert_eq!(pending_migrations(&copy).unwrap().len(), 1, "the copy is from before the upgrade");

        // Already up to date: nothing more is saved.
        drop(_conn);
        assert_eq!(open_db_with_upgrade_backup(&path, Some(&backups)).unwrap().1, None);
    }

    #[test]
    fn a_new_database_saves_no_copy() {
        let (_, saved) = open_db_with_upgrade_backup(&temp_db("new.db"), Some(&temp_db("backups"))).unwrap();
        assert_eq!(saved, None);
    }

    #[test]
    fn a_database_from_before_retired_operators_upgrades_with_everyone_active() {
        // A database (or a restored backup) made before 0017.
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
            [],
        )
        .unwrap();
        for (version, sql) in MIGRATIONS.iter().take_while(|(v, _)| *v != "0017_operator_retired.sql") {
            conn.execute_batch(sql).unwrap();
            conn.execute("INSERT INTO schema_migrations VALUES (?1, 't')", params![version]).unwrap();
        }
        conn.execute(
            "INSERT INTO operators(id, display_name, created_at) VALUES ('op1', 'Pat', 't')",
            [],
        )
        .unwrap();

        run_migrations(&conn).unwrap();

        let repo = crate::repo::Repository::new(conn);
        assert_eq!(repo.list_operators().unwrap().len(), 1);
        assert!(repo.list_retired_operators().unwrap().is_empty());
        assert!(is_known_migration("0017_operator_retired.sql"));
    }
}
