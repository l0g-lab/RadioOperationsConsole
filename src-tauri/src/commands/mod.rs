use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::repo::Repository;

mod activities;
mod aprs;
mod backup;
mod audit;
mod checkins;
mod callsigns;
mod datapacks;
mod events;
mod files;
mod geocode;
mod ics214;
mod net_listings;
mod operators;
mod places;
mod qrz;
mod relay;
mod repeaters;
mod settings;
mod shared_lists;
mod spotter_reports;
mod storage;
mod updates;
mod weather;

pub use activities::*;
pub use aprs::*;
pub use backup::*;
pub use audit::*;
pub use checkins::*;
pub use callsigns::*;
pub use datapacks::*;
pub use events::*;
pub use files::*;
pub use geocode::*;
pub use ics214::*;
pub use net_listings::*;
pub use operators::*;
pub use places::*;
pub use qrz::*;
pub use relay::*;
pub use repeaters::*;
pub use settings::*;
pub use shared_lists::*;
pub use spotter_reports::*;
pub use storage::*;
pub use updates::*;
pub use weather::*;

/// Stable error sentinels the frontend matches on to decide whether to show
/// any status at all (QRZ-003, QRZ-030). Any other Err string is a real,
/// user-actionable problem (bad credentials, missing subscription, etc.).
pub const ERR_OFFLINE: &str = "offline";

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct AppSettings {
    #[serde(default)]
    pub nws_api_key: String,
    #[serde(default)]
    pub qrz_username: String,
    #[serde(default)]
    pub qrz_password: String,
    #[serde(default)]
    pub weather_area_query: String,
    #[serde(default)]
    pub weather_area_label: String,
    #[serde(default)]
    pub weather_area_lat: Option<f64>,
    #[serde(default)]
    pub weather_area_lon: Option<f64>,
    #[serde(default)]
    pub weather_area_resolved_at: Option<String>,
    /// "Work offline" from the header (UX-020): no network requests at all.
    #[serde(default)]
    pub work_offline: bool,
}

pub struct AppState {
    pub repo: Mutex<Repository>,
    pub settings: Mutex<AppSettings>,
    pub settings_path: PathBuf,
    pub qrz_session: Mutex<Option<String>>,
    pub aprs_is_stream: Mutex<Option<crate::aprs_is::AprsIsStreamHandle>>,
    /// Where downloaded offline data packs live (see `datapacks.rs`).
    pub datapacks_dir: PathBuf,
    /// Loaded route packs (flag: true = a downloaded copy, false = bundled).
    pub route_packs: Mutex<Vec<(crate::routes::RoutePack, bool)>>,
    /// The offline call-sign directories (amateur, GMRS), each loaded on first
    /// use (tens of MB once unpacked, so they aren't read at startup).
    pub callsign_dbs:
        Mutex<std::collections::HashMap<crate::callsigns::Service, std::sync::Arc<crate::callsigns::CallDb>>>,
    /// One FCC download at a time, whichever directory it's for.
    pub callsign_update_running: std::sync::atomic::AtomicBool,
    /// Set by Cancel; the running download notices and stops (CALLDIR-037).
    pub callsign_update_cancel: std::sync::atomic::AtomicBool,
    /// The copy saved before this launch upgraded the database, if it did.
    pub upgrade_backup: Option<crate::db::UpgradeBackup>,
    /// The installer the last update check found for this computer, and
    /// where it was downloaded (commands/updates.rs).
    pub update_installer: Mutex<Option<crate::updates::Asset>>,
    pub update_download: Mutex<Option<PathBuf>>,
}

impl AppState {
    pub fn new(
        repo: Repository,
        settings_path: PathBuf,
        datapacks_dir: PathBuf,
        upgrade_backup: Option<crate::db::UpgradeBackup>,
    ) -> Self {
        let settings = if settings_path.exists() {
            fs::read_to_string(&settings_path)
                .ok()
                .and_then(|s| serde_json::from_str::<AppSettings>(&s).ok())
                .unwrap_or_default()
        } else {
            AppSettings::default()
        };
        // Start the way the operator left it (UX-024).
        crate::net::set_work_offline(settings.work_offline);
        Self {
            repo: Mutex::new(repo),
            settings: Mutex::new(settings),
            settings_path,
            qrz_session: Mutex::new(None),
            aprs_is_stream: Mutex::new(None),
            route_packs: Mutex::new(crate::datapacks::load_all(&datapacks_dir)),
            datapacks_dir,
            callsign_dbs: Mutex::new(std::collections::HashMap::new()),
            callsign_update_running: std::sync::atomic::AtomicBool::new(false),
            callsign_update_cancel: std::sync::atomic::AtomicBool::new(false),
            upgrade_backup,
            update_installer: Mutex::new(None),
            update_download: Mutex::new(None),
        }
    }
}

/// Writes settings to disk and updates the in-memory copy together, so the
/// two never drift — used by both the explicit Settings-tab save and the
/// area/location "set" commands that persist a resolved value as they go.
pub(super) fn persist_settings(state: &AppState, settings: &AppSettings) -> Result<(), String> {
    let serialized = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&state.settings_path, serialized).map_err(|e| e.to_string())?;
    *state.settings.lock().unwrap() = settings.clone();
    Ok(())
}

const CLOSED_MESSAGE: &str = "This activity is closed. Reopen it to make that change.";

/// Refuses ordinary changes to a closed activity until it is reopened (AUDIT-004).
pub(super) fn ensure_open(repo: &crate::repo::Repository, activity_id: &str) -> Result<(), String> {
    if repo.is_activity_closed(activity_id) {
        Err(CLOSED_MESSAGE.to_string())
    } else {
        Ok(())
    }
}

pub(super) fn ensure_checkin_open(repo: &crate::repo::Repository, checkin_id: &str) -> Result<(), String> {
    match repo.activity_id_of_checkin(checkin_id) {
        Some(a) => ensure_open(repo, &a),
        None => Ok(()),
    }
}

pub(super) fn ensure_report_open(repo: &crate::repo::Repository, report_id: &str) -> Result<(), String> {
    match repo.activity_id_of_spotter_report(report_id) {
        Some(a) => ensure_open(repo, &a),
        None => Ok(()),
    }
}
