//! Repeater and net lists to share with other operators
//! (docs/features/shared-lists.md). Like a backup, a list is one small SQLite
//! file, but it holds only the text of the repeaters or the nets: no ids, no
//! history, and no link from a net to a repeater. A net on a repeater is
//! written with the repeater's name and frequency as its frequency text, and
//! whoever imports it can link it to a repeater of their own.
//!
//! Importing only adds. A repeater or net already in use here is left as it
//! is, so nothing the operator has entered or linked is changed.

use crate::net_listings::{self, NetListingDetails};
use crate::repeaters::{self, RepeaterDetails};
use crate::repo::Repository;
use chrono::Utc;
use rusqlite::{params, Connection, OpenFlags};
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;

/// The file layout this version writes and reads. A file with a higher
/// number came from a newer version of the app.
const FORMAT: i64 = 1;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    Repeaters,
    Nets,
}

impl Kind {
    pub fn parse(s: &str) -> Result<Kind, String> {
        match s {
            "repeaters" => Ok(Kind::Repeaters),
            "nets" => Ok(Kind::Nets),
            _ => Err(format!("\"{s}\" isn't a kind of list.")),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Kind::Repeaters => "repeaters",
            Kind::Nets => "nets",
        }
    }

    fn noun(self) -> &'static str {
        match self {
            Kind::Repeaters => "repeater list",
            Kind::Nets => "net list",
        }
    }
}

/// What importing a file would do, or did.
#[derive(Serialize, Debug, Clone, PartialEq, Default)]
pub struct ImportSummary {
    /// Entries in the file.
    pub total: usize,
    /// Entries not here yet: added by an import.
    pub new: usize,
    /// Entries already here (or repeated in the file): left as they are.
    pub already_here: usize,
    /// Entries that aren't complete or valid, skipped.
    pub unreadable: usize,
    /// When the file was made (RFC 3339).
    pub exported_at: String,
}

/// Whether `conn` is one of these list files, of any kind.
pub fn is_shared_list(conn: &Connection) -> bool {
    conn.query_row("SELECT 1 FROM shared_list LIMIT 1", [], |_| Ok(())).is_ok()
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

/// Starts a new list file at `dest` (replacing a file already there, which
/// the operator has confirmed in the save dialog).
fn create_file(live: &Connection, dest: &Path, kind: Kind) -> Result<Connection, String> {
    if let Some(live_path) = live.path() {
        if same_file(Path::new(live_path), dest) {
            return Err("Choose a different file — that's the app's own database.".into());
        }
    }
    if dest.exists() {
        std::fs::remove_file(dest).map_err(|e| format!("Couldn't replace that file: {e}"))?;
    }
    let out = Connection::open(dest).map_err(|e| format!("Couldn't create that file: {e}"))?;
    out.execute_batch(
        "CREATE TABLE shared_list (kind TEXT NOT NULL, format INTEGER NOT NULL, exported_at TEXT NOT NULL);
         CREATE TABLE repeaters (name TEXT NOT NULL, output_mhz REAL NOT NULL, offset_mhz REAL NOT NULL,
             tone_in_kind TEXT NOT NULL, tone_in TEXT NOT NULL, tone_out_kind TEXT NOT NULL, tone_out TEXT NOT NULL,
             mode TEXT NOT NULL, location_label TEXT NOT NULL, location_lat REAL, location_lon REAL, notes TEXT NOT NULL);
         CREATE TABLE nets (name TEXT NOT NULL, activity_type TEXT NOT NULL, frequency TEXT NOT NULL,
             schedule_kind TEXT NOT NULL, weekdays TEXT NOT NULL, weeks TEXT NOT NULL, start_time TEXT NOT NULL,
             end_time TEXT NOT NULL, run_by TEXT NOT NULL, checkin_info TEXT NOT NULL, notes TEXT NOT NULL);",
    )
    .map_err(|e| e.to_string())?;
    out.execute(
        "INSERT INTO shared_list(kind, format, exported_at) VALUES (?1, ?2, ?3)",
        params![kind.name(), FORMAT, Utc::now().to_rfc3339()],
    )
    .map_err(|e| e.to_string())?;
    Ok(out)
}

fn join<T: ToString>(v: &[T]) -> String {
    v.iter().map(T::to_string).collect::<Vec<_>>().join(",")
}

/// A net's frequency as text alone: its repeater's name and one-line form
/// when it's on one, else its own frequency text.
fn net_frequency(repo: &Repository, d: &NetListingDetails) -> String {
    match d.repeater_id.as_deref().and_then(|id| repo.get_repeater(id).ok()) {
        Some(r) => format!("{} {}", r.details.name, repeaters::one_line(&r.details)),
        None => d.frequency.clone(),
    }
}

/// Writes the repeaters or nets in use (not retired) to `dest`. Returns how many.
pub fn export(repo: &Repository, dest: &Path, kind: Kind) -> Result<usize, String> {
    let mut out = create_file(&repo.conn, dest, kind)?;
    let tx = out.transaction().map_err(|e| e.to_string())?;
    let n = match kind {
        Kind::Repeaters => {
            let list = repo.list_repeaters(false).map_err(|e| e.to_string())?;
            for r in &list {
                let d = &r.details;
                tx.execute(
                    "INSERT INTO repeaters VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
                    params![d.name, d.output_mhz, d.offset_mhz, d.tone_in_kind, d.tone_in, d.tone_out_kind, d.tone_out, d.mode, d.location_label, d.location_lat, d.location_lon, d.notes],
                )
                .map_err(|e| e.to_string())?;
            }
            list.len()
        }
        Kind::Nets => {
            let list = repo.list_net_listings(false).map_err(|e| e.to_string())?;
            for l in &list {
                let d = &l.details;
                tx.execute(
                    "INSERT INTO nets VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                    params![d.name, d.activity_type, net_frequency(repo, d), d.schedule_kind, join(&d.weekdays), join(&d.weeks), d.start_time, d.end_time, d.run_by, d.checkin_info, d.notes],
                )
                .map_err(|e| e.to_string())?;
            }
            list.len()
        }
    };
    tx.commit().map_err(|e| e.to_string())?;
    Ok(n)
}

/// What a list file holds: its entries, each checked as if entered by hand
/// (None for one that doesn't pass), and when it was made.
struct Contents<T> {
    entries: Vec<Option<T>>,
    exported_at: String,
}

/// Opens `path` read-only and checks it's a list of this `kind` that this
/// version can read.
fn open_list(path: &Path, kind: Kind) -> Result<(Connection, String), String> {
    let not_ours = || format!("That isn't a {} from Radio Operations Console.", kind.noun());
    if !path.is_file() {
        return Err("That file doesn't exist.".into());
    }
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|_| not_ours())?;
    let (file_kind, format, exported_at): (String, i64, String) = conn
        .query_row("SELECT kind, format, exported_at FROM shared_list", [], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        })
        .map_err(|_| not_ours())?;
    if format > FORMAT {
        return Err(format!(
            "This {} was made by a newer version of the app. Update the app before importing it.",
            kind.noun()
        ));
    }
    if file_kind != kind.name() {
        let other = Kind::parse(&file_kind).map(Kind::noun).unwrap_or("different list");
        return Err(format!("That's a {other}, not a {}.", kind.noun()));
    }
    Ok((conn, exported_at))
}

fn read_repeaters(path: &Path) -> Result<Contents<RepeaterDetails>, String> {
    let (conn, exported_at) = open_list(path, Kind::Repeaters)?;
    let mut stmt = conn
        .prepare("SELECT name, output_mhz, offset_mhz, tone_in_kind, tone_in, tone_out_kind, tone_out, mode, location_label, location_lat, location_lon, notes FROM repeaters")
        .map_err(|e| e.to_string())?;
    let entries = stmt
        .query_map([], |r| {
            Ok(RepeaterDetails {
                name: r.get(0)?,
                output_mhz: r.get(1)?,
                offset_mhz: r.get(2)?,
                tone_in_kind: r.get(3)?,
                tone_in: r.get(4)?,
                tone_out_kind: r.get(5)?,
                tone_out: r.get(6)?,
                mode: r.get(7)?,
                location_label: r.get(8)?,
                location_lat: r.get(9)?,
                location_lon: r.get(10)?,
                notes: r.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|row| row.ok().and_then(|d| repeaters::clean(d).ok()))
        .collect();
    Ok(Contents { entries, exported_at })
}

fn read_nets(path: &Path) -> Result<Contents<NetListingDetails>, String> {
    let (conn, exported_at) = open_list(path, Kind::Nets)?;
    let mut stmt = conn
        .prepare("SELECT name, activity_type, frequency, schedule_kind, weekdays, weeks, start_time, end_time, run_by, checkin_info, notes FROM nets")
        .map_err(|e| e.to_string())?;
    let entries = stmt
        .query_map([], |r| {
            let weekdays: String = r.get(4)?;
            let weeks: String = r.get(5)?;
            Ok(NetListingDetails {
                name: r.get(0)?,
                activity_type: r.get(1)?,
                repeater_id: None,
                frequency: r.get(2)?,
                schedule_kind: r.get(3)?,
                weekdays: weekdays.split(',').filter_map(|w| w.trim().parse().ok()).collect(),
                weeks: weeks.split(',').map(str::trim).filter(|w| !w.is_empty()).map(String::from).collect(),
                start_time: r.get(6)?,
                end_time: r.get(7)?,
                run_by: r.get(8)?,
                checkin_info: r.get(9)?,
                notes: r.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|row| row.ok().and_then(|d| net_listings::clean(d).ok()))
        .collect();
    Ok(Contents { entries, exported_at })
}

/// How a repeater is recognised as one already here: its name and output frequency.
fn repeater_key(d: &RepeaterDetails) -> String {
    format!("{}|{:.4}", d.name.to_lowercase(), d.output_mhz)
}

/// How a net is recognised as one already here: its name.
fn net_key(d: &NetListingDetails) -> String {
    d.name.to_lowercase()
}

/// Sorts a file's entries into the ones to add and the counts for the rest.
/// `seen` starts as the keys of what's already here.
fn plan<T>(
    contents: Contents<T>,
    mut seen: HashSet<String>,
    key: fn(&T) -> String,
) -> (Vec<T>, ImportSummary) {
    let mut summary = ImportSummary {
        total: contents.entries.len(),
        exported_at: contents.exported_at,
        ..Default::default()
    };
    let mut add = Vec::new();
    for entry in contents.entries {
        match entry {
            None => summary.unreadable += 1,
            Some(d) if !seen.insert(key(&d)) => summary.already_here += 1,
            Some(d) => add.push(d),
        }
    }
    summary.new = add.len();
    (add, summary)
}

fn repeater_plan(repo: &Repository, path: &Path) -> Result<(Vec<RepeaterDetails>, ImportSummary), String> {
    let contents = read_repeaters(path)?;
    let here = repo.list_repeaters(false).map_err(|e| e.to_string())?;
    Ok(plan(contents, here.iter().map(|r| repeater_key(&r.details)).collect(), repeater_key))
}

fn net_plan(repo: &Repository, path: &Path) -> Result<(Vec<NetListingDetails>, ImportSummary), String> {
    let contents = read_nets(path)?;
    let here = repo.list_net_listings(false).map_err(|e| e.to_string())?;
    Ok(plan(contents, here.iter().map(|l| net_key(&l.details)).collect(), net_key))
}

/// What importing `path` would do, without changing anything.
pub fn inspect(repo: &Repository, path: &Path, kind: Kind) -> Result<ImportSummary, String> {
    match kind {
        Kind::Repeaters => repeater_plan(repo, path).map(|(_, s)| s),
        Kind::Nets => net_plan(repo, path).map(|(_, s)| s),
    }
}

/// Adds the entries in `path` that aren't here yet, all or none, recording
/// each in the history.
pub fn import(
    repo: &Repository,
    path: &Path,
    kind: Kind,
    operator_id: Option<&str>,
) -> Result<ImportSummary, String> {
    let tx = repo.conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let summary = match kind {
        Kind::Repeaters => {
            let (add, summary) = repeater_plan(repo, path)?;
            for d in add {
                let id = repo.create_repeater(&d).map_err(|e| e.to_string())?;
                let data = serde_json::json!({ "after": d }).to_string();
                repo.create_audit_event("repeater", &id, "create", Some(&data), operator_id)
                    .map_err(|e| e.to_string())?;
            }
            summary
        }
        Kind::Nets => {
            let (add, summary) = net_plan(repo, path)?;
            for d in add {
                let id = repo.create_net_listing(&d).map_err(|e| e.to_string())?;
                let data = serde_json::json!({ "after": d }).to_string();
                repo.create_audit_event("net_listing", &id, "create", Some(&data), operator_id)
                    .map_err(|e| e.to_string())?;
            }
            summary
        }
    };
    tx.commit().map_err(|e| e.to_string())?;
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use uuid::Uuid;

    fn temp(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("roc-share-{}-{name}", Uuid::new_v4()))
    }

    fn repo() -> Repository {
        Repository::new(crate::db::open_db(&temp("live.db")).unwrap())
    }

    fn w4abc() -> RepeaterDetails {
        repeaters::clean(RepeaterDetails {
            name: "W4ABC Orlando".into(),
            output_mhz: 146.94,
            offset_mhz: -0.6,
            tone_in_kind: "pl".into(),
            tone_in: "100.0".into(),
            location_label: "Downtown".into(),
            location_lat: Some(28.54),
            location_lon: Some(-81.38),
            notes: "Linked to K4XYZ".into(),
            ..Default::default()
        })
        .unwrap()
    }

    fn net(name: &str, repeater_id: Option<String>) -> NetListingDetails {
        net_listings::clean(NetListingDetails {
            name: name.into(),
            activity_type: "directed_net".into(),
            repeater_id,
            frequency: "146.520 simplex".into(),
            schedule_kind: "monthly".into(),
            weekdays: vec![4],
            weeks: vec!["2".into(), "last".into()],
            start_time: "19:00".into(),
            end_time: "19:30".into(),
            run_by: "Orange County ARES".into(),
            checkin_info: "Call sign and name".into(),
            ..Default::default()
        })
        .unwrap()
    }

    #[test]
    fn repeaters_go_to_another_station_as_they_are() {
        let from = repo();
        from.create_repeater(&w4abc()).unwrap();
        let old = from.create_repeater(&repeaters::clean(RepeaterDetails { name: "Old".into(), output_mhz: 147.0, ..Default::default() }).unwrap()).unwrap();
        from.set_repeater_retired(&old, true).unwrap();

        let file = temp("repeaters.db");
        assert_eq!(export(&from, &file, Kind::Repeaters).unwrap(), 1, "retired ones stay behind");

        let to = repo();
        let preview = inspect(&to, &file, Kind::Repeaters).unwrap();
        assert_eq!((preview.total, preview.new, preview.already_here), (1, 1, 0));
        assert!(to.list_repeaters(false).unwrap().is_empty(), "inspecting changes nothing");

        import(&to, &file, Kind::Repeaters, None).unwrap();
        let got = to.list_repeaters(false).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].details, w4abc());
    }

    #[test]
    fn a_net_on_a_repeater_goes_as_text_alone() {
        let from = repo();
        let rid = from.create_repeater(&w4abc()).unwrap();
        from.create_net_listing(&net("ARES Net", Some(rid))).unwrap();
        from.create_net_listing(&net("Simplex Net", None)).unwrap();

        let file = temp("nets.db");
        assert_eq!(export(&from, &file, Kind::Nets).unwrap(), 2);

        let to = repo();
        import(&to, &file, Kind::Nets, None).unwrap();
        let got = to.list_net_listings(false).unwrap();
        assert_eq!(got.len(), 2);
        let ares = &got[0].details;
        assert_eq!(ares.repeater_id, None);
        assert_eq!(ares.frequency, "W4ABC Orlando 146.940 -0.600 PL 100.0");
        assert_eq!((ares.weekdays.clone(), ares.weeks.clone()), (vec![4], vec!["2".to_string(), "last".to_string()]));
        assert_eq!(ares.checkin_info, "Call sign and name");
        assert_eq!(got[1].details.frequency, "146.520 simplex");
        assert!(to.list_repeaters(false).unwrap().is_empty(), "no repeater comes with it");
    }

    #[test]
    fn importing_only_adds_what_is_not_here() {
        let from = repo();
        from.create_net_listing(&net("ARES Net", None)).unwrap();
        from.create_net_listing(&net("Tuesday Net", None)).unwrap();
        let file = temp("nets.db");
        export(&from, &file, Kind::Nets).unwrap();

        let to = repo();
        let mut mine = net("ares net", None);
        mine.notes = "My own notes".into();
        to.create_net_listing(&mine).unwrap();

        let done = import(&to, &file, Kind::Nets, None).unwrap();
        assert_eq!((done.new, done.already_here), (1, 1));
        let names: Vec<_> = to.list_net_listings(false).unwrap().into_iter().map(|l| l.details).collect();
        assert_eq!(names.len(), 2);
        assert_eq!(names[0].notes, "My own notes", "what's here is left as it is");

        // A second import adds nothing.
        let again = import(&to, &file, Kind::Nets, None).unwrap();
        assert_eq!((again.new, again.already_here), (0, 2));
    }

    #[test]
    fn entries_that_do_not_check_out_are_skipped() {
        let from = repo();
        from.create_repeater(&w4abc()).unwrap();
        let file = temp("repeaters.db");
        export(&from, &file, Kind::Repeaters).unwrap();
        Connection::open(&file)
            .unwrap()
            .execute("INSERT INTO repeaters SELECT '', 146.0, 0, 'pl', '99.9', 'none', '', 'FM', '', NULL, NULL, ''", [])
            .unwrap();

        let to = repo();
        let done = import(&to, &file, Kind::Repeaters, None).unwrap();
        assert_eq!((done.total, done.new, done.unreadable), (2, 1, 1));
    }

    #[test]
    fn refuses_the_wrong_file() {
        let r = repo();
        let nets = temp("nets.db");
        export(&r, &nets, Kind::Nets).unwrap();
        let err = inspect(&r, &nets, Kind::Repeaters).unwrap_err();
        assert!(err.contains("net list, not a repeater list"), "{err}");

        // A whole-database backup isn't a list, and a list isn't a backup.
        let backup = temp("backup.db");
        crate::backup::create_backup(&r.conn, &backup).unwrap();
        assert!(inspect(&r, &backup, Kind::Nets).unwrap_err().contains("isn't a net list"));
        assert!(crate::backup::inspect(&nets).unwrap_err().contains("not a backup"));

        let junk = temp("junk.db");
        std::fs::write(&junk, b"not a database").unwrap();
        assert!(inspect(&r, &junk, Kind::Nets).is_err());

        Connection::open(&nets).unwrap().execute("UPDATE shared_list SET format = 99", []).unwrap();
        assert!(inspect(&r, &nets, Kind::Nets).unwrap_err().contains("newer version"));
    }

    #[test]
    fn will_not_export_onto_the_live_database() {
        let path = temp("live.db");
        let r = Repository::new(crate::db::open_db(&path).unwrap());
        assert!(export(&r, &path, Kind::Repeaters).is_err());
    }
}
