import { invoke } from "@tauri-apps/api/core";
import type {
  Activity,
  Repeater,
  RepeaterDetails,
  HistoryEvent,
  ActivitySummary,
  DeletedCounts,
  BackupSummary,
  RestoreResult,
  UpgradeBackup,
  CallsignPackStatus,
  OfflineCallLookup,
  LicenseService,
  AppSettings,
  AuditEvent,
  Checkin,
  ContactDetails,
  DataPackInfo,
  GeocodeResult,
  MileMarkerHit,
  Operator,
  QrzLookupResponse,
  SpotterReport,
  StorageItem,
  StorageItemId,
  StationHistory,
} from "./types";

export const listOperators = () => invoke<Operator[]>("list_operators");

// Removing operators (AUDIT-012/013): one nothing names can be deleted;
// otherwise retired (hidden, kept for history) and restorable.
export const listRetiredOperators = () => invoke<Operator[]>("list_retired_operators");

export const operatorHasRecords = (operator_id: string) =>
  invoke<boolean>("operator_has_records", { operatorId: operator_id });

export const deleteOperator = (operator_id: string) =>
  invoke<void>("delete_operator", { operatorId: operator_id });

export const retireOperator = (operator_id: string, acting_operator_id: string | null) =>
  invoke<void>("retire_operator", {
    operatorId: operator_id,
    actingOperatorId: acting_operator_id,
  });

export const restoreOperator = (operator_id: string, acting_operator_id: string | null) =>
  invoke<void>("restore_operator", {
    operatorId: operator_id,
    actingOperatorId: acting_operator_id,
  });

export const createOperator = (display_name: string, call_sign: string | null) =>
  invoke<string>("create_operator", { displayName: display_name, callSign: call_sign });

export const setOperatorLocation = (operator_id: string, query: string) =>
  invoke<Operator>("set_operator_location", { operatorId: operator_id, query });

export const setOperatorLocationCoords = (
  operator_id: string,
  lat: number,
  lon: number,
  label: string | null
) =>
  invoke<Operator>("set_operator_location_coords", {
    operatorId: operator_id,
    lat,
    lon,
    label,
  });

export const listActivities = () => invoke<Activity[]>("list_activities");

export const listArchivedActivities = () =>
  invoke<Activity[]>("list_archived_activities");

export const createActivity = (
  title: string,
  activity_type: string,
  scheduled_at: string | null,
  frequency: string | null
) =>
  invoke<string>("create_activity", {
    title,
    activityType: activity_type,
    scheduledAt: scheduled_at,
    frequency,
  });

export const updateActivity = (
  activity_id: string,
  title: string,
  activity_type: string,
  scheduled_at: string | null,
  frequency: string | null,
  operator_id: string | null
) =>
  invoke<void>("update_activity", {
    activityId: activity_id,
    title,
    activityType: activity_type,
    scheduledAt: scheduled_at,
    frequency,
    operatorId: operator_id,
  });

export const setActivityLocation = (activity_id: string, query: string) =>
  invoke<Activity>("set_activity_location", { activityId: activity_id, query });

export const setActivityLocationCoords = (
  activity_id: string,
  lat: number,
  lon: number,
  label: string | null
) =>
  invoke<Activity>("set_activity_location_coords", {
    activityId: activity_id,
    lat,
    lon,
    label,
  });

export const archiveActivity = (
  activity_id: string,
  reason: string | null,
  operator_id: string | null
) =>
  invoke<void>("archive_activity", {
    activityId: activity_id,
    reason,
    operatorId: operator_id,
  });

export const restoreActivity = (activity_id: string, operator_id: string | null) =>
  invoke<void>("restore_activity", { activityId: activity_id, operatorId: operator_id });

// Permanent deletion (AUDIT-007): what it would erase, then erase it.
export const activityDeletePreview = (activity_id: string) =>
  invoke<DeletedCounts>("activity_delete_preview", { activityId: activity_id });

export const deleteActivity = (activity_id: string, operator_id: string | null) =>
  invoke<DeletedCounts>("delete_activity", { activityId: activity_id, operatorId: operator_id });

// Repeater directory (repeater-directory.md).
export const listRepeaters = (retired = false) => invoke<Repeater[]>("list_repeaters", { retired });

/** Adds a repeater, or with an id replaces its details. Returns its id. */
export const saveRepeater = (
  repeater_id: string | null,
  details: RepeaterDetails,
  operator_id: string | null
) => invoke<string>("save_repeater", { repeaterId: repeater_id, details, operatorId: operator_id });

export const setRepeaterRetired = (repeater_id: string, retired: boolean, operator_id: string | null) =>
  invoke<void>("set_repeater_retired", { repeaterId: repeater_id, retired, operatorId: operator_id });

/** Sets the activity's repeater, or clears it with no point. */
export const setActivityRepeater = (
  activity_id: string,
  name: string | null,
  lat: number | null,
  lon: number | null
) => invoke<Activity>("set_activity_repeater", { activityId: activity_id, name, lat, lon });

export const createCheckin = (
  activity_id: string,
  call_sign: string,
  name: string | null,
  qth_location: string | null,
  grid_square: string | null,
  address: string | null,
  operator_id: string | null,
  location_lat: number | null,
  location_lon: number | null,
  location_label: string | null,
  has_traffic: boolean,
  traffic: string | null,
  contact: ContactDetails | null = null
) =>
  invoke<string>("create_checkin", {
    activityId: activity_id,
    callSign: call_sign,
    name,
    qthLocation: qth_location,
    gridSquare: grid_square,
    address,
    operatorId: operator_id,
    locationLat: location_lat,
    locationLon: location_lon,
    locationLabel: location_label,
    hasTraffic: has_traffic,
    traffic,
    contact,
  });

/** Earlier records of a call sign across every activity. */
export const stationHistory = (call_sign: string) =>
  invoke<StationHistory>("station_history", { callSign: call_sign });

export const listCheckins = (activity_id: string) =>
  invoke<Checkin[]>("list_checkins", { activityId: activity_id });

export const listVoidedCheckins = (activity_id: string) =>
  invoke<Checkin[]>("list_voided_checkins", { activityId: activity_id });

export const updateCheckin = (
  checkin_id: string,
  call_sign: string,
  name: string | null,
  qth_location: string | null,
  grid_square: string | null,
  address: string | null,
  operator_id: string | null,
  location_lat: number | null,
  location_lon: number | null,
  location_label: string | null,
  has_traffic: boolean,
  traffic: string | null,
  /** Left out, the contact's details and time stay as they are. */
  contact: ContactDetails | null = null
) =>
  invoke<void>("update_checkin", {
    checkinId: checkin_id,
    callSign: call_sign,
    name,
    qthLocation: qth_location,
    gridSquare: grid_square,
    address,
    operatorId: operator_id,
    locationLat: location_lat,
    locationLon: location_lon,
    locationLabel: location_label,
    hasTraffic: has_traffic,
    traffic,
    contact,
  });

export const setCheckinTrafficHandled = (
  checkin_id: string,
  handled: boolean,
  operator_id: string | null
) =>
  invoke<void>("set_checkin_traffic_handled", {
    checkinId: checkin_id,
    handled,
    operatorId: operator_id,
  });

export const setCheckinLocationCoords = (
  checkin_id: string,
  lat: number,
  lon: number,
  label: string | null
) =>
  invoke<Checkin>("set_checkin_location_coords", { checkinId: checkin_id, lat, lon, label });

export const clearCheckinLocation = (checkin_id: string) =>
  invoke<Checkin>("clear_checkin_location", { checkinId: checkin_id });

export const voidCheckin = (
  checkin_id: string,
  reason: string | null,
  operator_id: string | null
) =>
  invoke<void>("void_checkin", { checkinId: checkin_id, reason, operatorId: operator_id });

export const restoreCheckin = (checkin_id: string, operator_id: string | null) =>
  invoke<void>("restore_checkin", { checkinId: checkin_id, operatorId: operator_id });

export const createSpotterReport = (
  activity_id: string,
  reported_at: string,
  county: string | null,
  location_text: string | null,
  lat: number | null,
  lon: number | null,
  reporter: string | null,
  hazard_type: string,
  magnitude: string | null,
  source: string | null,
  notes: string | null,
  checkin_id: string | null,
  operator_id: string | null
) =>
  invoke<string>("create_spotter_report", {
    activityId: activity_id,
    reportedAt: reported_at,
    county,
    locationText: location_text,
    lat,
    lon,
    reporter,
    hazardType: hazard_type,
    magnitude,
    source,
    notes,
    checkinId: checkin_id,
    operatorId: operator_id,
  });

export const listSpotterReports = (activity_id: string) =>
  invoke<SpotterReport[]>("list_spotter_reports", { activityId: activity_id });

export const listVoidedSpotterReports = (activity_id: string) =>
  invoke<SpotterReport[]>("list_voided_spotter_reports", { activityId: activity_id });

export const updateSpotterReport = (
  report_id: string,
  reported_at: string,
  county: string | null,
  location_text: string | null,
  lat: number | null,
  lon: number | null,
  reporter: string | null,
  hazard_type: string,
  magnitude: string | null,
  source: string | null,
  notes: string | null,
  checkin_id: string | null,
  operator_id: string | null
) =>
  invoke<void>("update_spotter_report", {
    reportId: report_id,
    reportedAt: reported_at,
    county,
    locationText: location_text,
    lat,
    lon,
    reporter,
    hazardType: hazard_type,
    magnitude,
    source,
    notes,
    checkinId: checkin_id,
    operatorId: operator_id,
  });

export const voidSpotterReport = (
  report_id: string,
  reason: string | null,
  operator_id: string | null
) => invoke<void>("void_spotter_report", { reportId: report_id, reason, operatorId: operator_id });

export const restoreSpotterReport = (report_id: string, operator_id: string | null) =>
  invoke<void>("restore_spotter_report", { reportId: report_id, operatorId: operator_id });

export const createAuditEvent = (
  entity_type: string,
  entity_id: string,
  action: string,
  data: string | null,
  operator_id: string | null
) =>
  invoke<string>("create_audit_event", {
    entityType: entity_type,
    entityId: entity_id,
    action,
    data,
    operatorId: operator_id,
  });

export const listAuditEvents = (entity_id: string) =>
  invoke<AuditEvent[]>("list_audit_events", { entityId: entity_id });

export const listRecentAuditEvents = (limit: number) =>
  invoke<AuditEvent[]>("list_recent_audit_events", { limit });

export const getSettings = () => invoke<AppSettings>("get_settings");

export const saveSettings = (settings: AppSettings) =>
  invoke<void>("save_settings", { settings });

/** "Work offline" from the header (UX-020): saved, and enforced by the backend. */
export const setWorkOffline = (on: boolean) => invoke<void>("set_work_offline", { on });

export const setWeatherArea = (query: string) =>
  invoke<AppSettings>("set_weather_area", { query });

export const setWeatherAreaCoords = (lat: number, lon: number, label: string | null) =>
  invoke<AppSettings>("set_weather_area_coords", { lat, lon, label });

export const fetchNwsAlerts = () => invoke<unknown>("fetch_nws_alerts");

export const fetchNwsForecast = () => invoke<unknown>("fetch_nws_forecast");

// Live APRS-IS area feed (no API key — see aprs_is.rs). Packets arrive as
// "aprs-is-packet" events, not as this call's return value.
export const startAprsIsStream = (
  call_sign: string,
  lat: number,
  lon: number,
  radius_km: number
) =>
  invoke<void>("start_aprs_is_stream", {
    callSign: call_sign,
    lat,
    lon,
    radiusKm: radius_km,
  });

export const stopAprsIsStream = () => invoke<void>("stop_aprs_is_stream");

export const lookupQrzCallsign = (call_sign: string) =>
  invoke<QrzLookupResponse | null>("lookup_qrz_callsign", { callSign: call_sign });

export const geocodeLocation = (query: string) =>
  invoke<GeocodeResult | null>("geocode_location", { query });

// Offline data packs (mile-marker road data, etc.): listing and resolving
// are local; updating downloads fresh data and needs internet.
export const listDataPacks = () => invoke<DataPackInfo[]>("list_data_packs");

export const updateDataPack = (id: string) => invoke<DataPackInfo>("update_data_pack", { id });

export const resolveMileMarker = (text: string) =>
  invoke<MileMarkerHit | null>("resolve_mile_marker", { text });

// Offline call-sign directories (FCC amateur and GMRS licenses), one file per
// service. Status and lookup are local; updating downloads the FCC's database
// (large) and needs internet.
export const callsignPackStatus = (service: LicenseService) =>
  invoke<CallsignPackStatus>("callsign_pack_status", { service });

export const updateCallsignPack = (service: LicenseService) =>
  invoke<CallsignPackStatus>("update_callsign_pack", { service });

/** Stops the running call-sign download; downloading again resumes (CALLDIR-037). */
export const cancelCallsignDownload = () => invoke<void>("cancel_callsign_download");

export const removeCallsignPack = (service: LicenseService) =>
  invoke<CallsignPackStatus>("remove_callsign_pack", { service });

export const lookupCallsignOffline = (call_sign: string, service: LicenseService) =>
  invoke<OfflineCallLookup>("lookup_callsign_offline", { callSign: call_sign, service });

// What's kept on this computer besides the records (STORE-001), and clearing it.
export const storageUsage = () => invoke<StorageItem[]>("storage_usage");
export const clearStorage = (id: StorageItemId) =>
  invoke<StorageItem[]>("clear_storage", { id });
/** The folder the webview keeps cached map tiles in. */
export const tileCacheLocation = () => invoke<string>("tile_cache_location");

export const backupDatabase = (path: string) => invoke<BackupSummary>("backup_database", { path });

export const inspectBackup = (path: string) => invoke<BackupSummary>("inspect_backup", { path });

export const restoreDatabase = (path: string) => invoke<RestoreResult>("restore_database", { path });

/** The copy saved before this launch upgraded the database, if it did. */
export const upgradeBackup = () => invoke<UpgradeBackup | null>("upgrade_backup");

export const startActivity = (activity_id: string, operator_id: string | null) =>
  invoke<void>("start_activity", { activityId: activity_id, operatorId: operator_id });

export const closeActivity = (
  activity_id: string,
  conclusion: string | null,
  operator_id: string | null
) =>
  invoke<void>("close_activity", {
    activityId: activity_id,
    conclusion,
    operatorId: operator_id,
  });

export const reopenActivity = (activity_id: string, reason: string, operator_id: string | null) =>
  invoke<void>("reopen_activity", { activityId: activity_id, reason, operatorId: operator_id });

export const activitySummary = (activity_id: string) =>
  invoke<ActivitySummary>("activity_summary", { activityId: activity_id });

export const activityHistory = (activity_id: string) =>
  invoke<HistoryEvent[]>("activity_history", { activityId: activity_id });
