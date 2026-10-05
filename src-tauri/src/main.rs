#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod aprs_is;
mod backup;
mod callsigns;
mod commands;
mod connectors;
mod datapacks;
mod db;
mod events;
mod ics214;
mod relay;
mod net;
mod net_listings;
mod places;
mod range_check;
mod repeaters;
mod repo;
mod routes;
mod storage;
mod updates;

use commands::AppState;
use repo::Repository;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let db_path = data_dir.join("radio_ops.db");
            // Upgrading an existing database saves a copy of it first, next
            // to the "before restore" copies.
            let (conn, upgrade_backup) =
                db::open_db_with_upgrade_backup(&db_path, Some(&data_dir.join("backups")))
                    .expect("failed to open database");
            let repo = Repository::new(conn);

            let config_dir = app.path().app_config_dir()?;
            std::fs::create_dir_all(&config_dir).ok();
            let settings_path = config_dir.join("settings.json");

            let datapacks_dir = data_dir.join("datapacks");

            app.manage(AppState::new(repo, settings_path, datapacks_dir, upgrade_backup));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_operators,
            commands::create_operator,
            commands::set_operator_location,
            commands::set_operator_location_coords,
            commands::list_activities,
            commands::create_activity,
            commands::update_activity,
            commands::start_activity,
            commands::close_activity,
            commands::reopen_activity,
            commands::activity_summary,
            commands::set_activity_location,
            commands::set_activity_location_coords,
            commands::list_repeaters,
            commands::save_repeater,
            commands::set_repeater_retired,
            commands::set_activity_repeater,
            commands::list_ics214_logs,
            commands::save_ics214_log,
            commands::delete_ics214_log,
            commands::set_activity_times,
            commands::set_activity_event,
            commands::list_events,
            commands::save_event,
            commands::delete_event,
            commands::change_activity_operator,
            commands::operator_usage,
            commands::update_operator,
            commands::list_relay_messages,
            commands::list_removed_relay_messages,
            commands::create_relay_message,
            commands::update_relay_message,
            commands::add_relay_step,
            commands::undo_relay_step,
            commands::void_relay_message,
            commands::restore_relay_message,
            commands::list_places,
            commands::save_place,
            commands::delete_place,
            commands::list_net_listings,
            commands::save_net_listing,
            commands::set_net_listing_retired,
            commands::create_checkin,
            commands::list_checkins,
            commands::station_history,
            commands::list_voided_checkins,
            commands::update_checkin,
            commands::set_checkin_traffic_handled,
            commands::void_checkin,
            commands::restore_checkin,
            commands::set_checkin_location_coords,
            commands::clear_checkin_location,
            commands::create_spotter_report,
            commands::list_spotter_reports,
            commands::list_voided_spotter_reports,
            commands::update_spotter_report,
            commands::void_spotter_report,
            commands::restore_spotter_report,
            commands::activity_delete_preview,
            commands::delete_activity,
            commands::list_retired_operators,
            commands::delete_operator,
            commands::retire_operator,
            commands::restore_operator,
            commands::create_audit_event,
            commands::list_audit_events,
            commands::list_recent_audit_events,
            commands::activity_history,
            commands::get_settings,
            commands::save_settings,
            commands::set_work_offline,
            commands::set_weather_area,
            commands::set_weather_area_coords,
            commands::fetch_nws_alerts,
            commands::fetch_nws_forecast,
            commands::start_aprs_is_stream,
            commands::stop_aprs_is_stream,
            commands::allow_export_extension,
            commands::check_for_update,
            commands::download_update,
            commands::open_update_installer,
            commands::backup_database,
            commands::inspect_backup,
            commands::restore_database,
            commands::upgrade_backup,
            commands::list_data_packs,
            commands::update_data_pack,
            commands::resolve_mile_marker,
            commands::callsign_pack_status,
            commands::update_callsign_pack,
            commands::cancel_callsign_download,
            commands::remove_callsign_pack,
            commands::lookup_callsign_offline,
            commands::storage_usage,
            commands::clear_storage,
            commands::tile_cache_location,
            commands::lookup_qrz_callsign,
            commands::geocode_location,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
