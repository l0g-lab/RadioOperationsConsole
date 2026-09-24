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
];

/// Whether this build knows the migration, i.e. a database that has it wasn't
/// made by a newer version of the app.
pub fn is_known_migration(version: &str) -> bool {
    MIGRATIONS.iter().any(|(v, _)| *v == version)
}

pub fn open_db(path: &Path) -> Result<Connection, Box<dyn Error>> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path).map_err(Box::<dyn Error>::from)?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(Box::<dyn Error>::from)?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(Box::<dyn Error>::from)?;
    run_migrations(&conn)?;
    Ok(conn)
}

pub fn run_migrations(conn: &Connection) -> Result<(), Box<dyn Error>> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
        [],
    )?;

    for (version, sql) in MIGRATIONS {
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

        conn.execute_batch(sql)?;

        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at) VALUES(?1, ?2)",
            params![version, now],
        )?;
    }

    Ok(())
}
