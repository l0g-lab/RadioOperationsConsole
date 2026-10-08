import { invoke } from "@tauri-apps/api/core";
import type {
  HistoryEntry,
  CurrentWeather,
  Activity,
  EventRecord,
  OperatorUsage,
  RelayMessage,
  RelayMessageInput,
  RelayStepInput,
  Ics214Details,
  Ics214Log,
  ImportSummary,
  NetListing,
  Place,
  PlaceDetails,
  NetListingDetails,
  Repeater,
  RepeaterDetails,
  ActivityAlert,
  ActivitySummary,
  DeletedCounts,
  BackupSummary,
  RestoreResult,
  UpgradeBackup,
  UpdateInfo,
  InstallerOpened,
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

/** Where an operator is named: what stops them being deleted (AUDIT-013). */
export const operatorUsage = (operator_id: string) =>
  invoke<OperatorUsage>("operator_usage", { operatorId: operator_id });

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

/** Corrects an operator's name and call sign, recorded in the history. */
export const updateOperator = (
  operator_id: string,
  display_name: string,
  call_sign: string | null,
  acting_operator_id: string | null
) =>
  invoke<void>("update_operator", {
    operatorId: operator_id,
    displayName: display_name,
    callSign: call_sign,
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

export const createActivity = (
  title: string,
  activity_type: string,
  scheduled_at: string | null,
  frequency: string | null,
  operator_id: string | null = null
) =>
  invoke<string>("create_activity", {
    title,
    activityType: activity_type,
    scheduledAt: scheduled_at,
    frequency,
    operatorId: operator_id,
  });

// Events (docs/features/events.md).

export const listEvents = () => invoke<EventRecord[]>("list_events");

/** Adds an event (no id) or renames / re-dates one; returns its id. */
export const saveEvent = (event_id: string | null, name: string, date: string, operator_id: string | null) =>
  invoke<string>("save_event", { eventId: event_id, name, date, operatorId: operator_id });

export const deleteEvent = (event_id: string, operator_id: string | null) =>
  invoke<void>("delete_event", { eventId: event_id, operatorId: operator_id });

/** Puts an activity in an event, or takes it out with null. */
export const setActivityEvent = (activity_id: string, event_id: string | null, operator_id: string | null) =>
  invoke<void>("set_activity_event", { activityId: activity_id, eventId: event_id, operatorId: operator_id });

/** Moves an activity, and what was recorded in it, to another operator. */
export const changeActivityOperator = (activity_id: string, operator_id: string) =>
  invoke<void>("change_activity_operator", { activityId: activity_id, operatorId: operator_id });

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

// Permanent deletion (AUDIT-007): what it would erase, then erase it.
export const activityDeletePreview = (activity_id: string) =>
  invoke<DeletedCounts>("activity_delete_preview", { activityId: activity_id });

export const deleteActivity = (activity_id: string, operator_id: string | null) =>
  invoke<DeletedCounts>("delete_activity", { activityId: activity_id, operatorId: operator_id });

/**
 * Lets an export add its extension to a name chosen in a save dialog (which
 * only allowed the name as typed). Returns the path to write.
 */
export const allowExportExtension = (path: string, ext: string) =>
  invoke<string>("allow_export_extension", { path, ext });

// Updates (src-tauri/src/updates.rs): check GitHub, download the installer
// for this computer, and open it.
export const checkForUpdate = () => invoke<UpdateInfo | null>("check_for_update");
/** Downloads the installer the last check found; returns where it was saved. */
export const downloadUpdate = () => invoke<string>("download_update");
export const openUpdateInstaller = () => invoke<InstallerOpened>("open_update_installer");

// ICS 214 activity logs (ics-form-exports.md).
export const listIcs214Logs = () => invoke<Ics214Log[]>("list_ics214_logs");

/** Adds a log, or with an id replaces it. Returns it as saved (tidied, in time order). */
export const saveIcs214Log = (log_id: string | null, details: Ics214Details, operator_id: string | null) =>
  invoke<Ics214Log>("save_ics214_log", { logId: log_id, details, operatorId: operator_id });

export const deleteIcs214Log = (log_id: string, operator_id: string | null) =>
  invoke<void>("delete_ics214_log", { logId: log_id, operatorId: operator_id });

// Saved places (saved-places.md).
export const listPlaces = () => invoke<Place[]>("list_places");

/** Adds a place, or with an id replaces its details. Returns its id. */
export const savePlace = (place_id: string | null, details: PlaceDetails, operator_id: string | null) =>
  invoke<string>("save_place", { placeId: place_id, details, operatorId: operator_id });

export const deletePlace = (place_id: string, operator_id: string | null) =>
  invoke<void>("delete_place", { placeId: place_id, operatorId: operator_id });

// Net listings (net-listings.md).
export const listNetListings = (retired = false) =>
  invoke<NetListing[]>("list_net_listings", { retired });

/** Adds a listing, or with an id replaces its details. Returns its id. */
export const saveNetListing = (
  listing_id: string | null,
  details: NetListingDetails,
  operator_id: string | null
) => invoke<string>("save_net_listing", { listingId: listing_id, details, operatorId: operator_id });

export const setNetListingRetired = (listing_id: string, retired: boolean, operator_id: string | null) =>
  invoke<void>("set_net_listing_retired", { listingId: listing_id, retired, operatorId: operator_id });
/** Deletes a retired net listing for good (NETL-012). */
export const deleteNetListing = (listing_id: string, operator_id: string | null) =>
  invoke<void>("delete_net_listing", { listingId: listing_id, operatorId: operator_id });

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
/** Deletes a retired repeater for good; nets on it keep its frequency as text (RPT-013). */
export const deleteRepeater = (repeater_id: string, operator_id: string | null) =>
  invoke<void>("delete_repeater", { repeaterId: repeater_id, operatorId: operator_id });

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
  contact: ContactDetails | null = null,
  /** The location was placed by hand (typed coordinates or a mile marker). */
  location_manual = false
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
    locationManual: location_manual,
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
  contact: ContactDetails | null = null,
  /** A corrected check-in time (ISO); left out, it stays as it is. */
  checked_in_at: string | null = null
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
    checkedInAt: checked_in_at,
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

/** Attaches a copy of an NWS alert to a net (SPOT-060). */
export const attachActivityAlert = (
  activity_id: string,
  alert: Omit<ActivityAlert, "id" | "attached_at">,
  operator_id: string | null
) => invoke<ActivityAlert>("attach_activity_alert", { activityId: activity_id, alert, operatorId: operator_id });

export const detachActivityAlert = (alert_id: string, operator_id: string | null) =>
  invoke<void>("detach_activity_alert", { alertId: alert_id, operatorId: operator_id });

export const listActivityAlerts = (activity_id: string) =>
  invoke<ActivityAlert[]>("list_activity_alerts", { activityId: activity_id });

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

/** The History tab's lines, newest first. */
export const listHistory = (limit: number) => invoke<HistoryEntry[]>("list_history", { limit });

export const getSettings = () => invoke<AppSettings>("get_settings");

export const saveSettings = (settings: AppSettings) =>
  invoke<void>("save_settings", { settings });

/** "Work offline" from the header (UX-020): saved, and enforced by the backend. */
export const setWorkOffline = (on: boolean) => invoke<void>("set_work_offline", { on });

export const setWeatherArea = (query: string) =>
  invoke<AppSettings>("set_weather_area", { query });

export const setWeatherAreaCoords = (lat: number, lon: number, label: string | null) =>
  invoke<AppSettings>("set_weather_area_coords", { lat, lon, label });

/** Active alerts at a point, or the weather area of interest without one. */
export const fetchNwsAlerts = (point?: { lat: number; lon: number }) =>
  invoke<unknown>("fetch_nws_alerts", { lat: point?.lat ?? null, lon: point?.lon ?? null });

export const fetchNwsForecast = () => invoke<unknown>("fetch_nws_forecast");

/** The radar loop's scan times (ISO, oldest first): the last hour, about every 4 minutes. */
export const fetchRadarFrames = () => invoke<string[]>("fetch_radar_frames");

/** The nearest station's latest reading at a point, or null if none has reported. */
export const fetchCurrentWeather = (lat: number, lon: number) =>
  invoke<CurrentWeather | null>("fetch_current_weather", { lat, lon });

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

/** Tries the saved QRZ username and password; rejects with QRZ's reason (or "offline"). */
export const checkQrzLogin = () => invoke<void>("check_qrz_login");

/** Looks a typed check-in location up online after saving, near the net (LOCRES-050). */
export const placeCheckinLater = (
  checkin_id: string,
  text: string,
  near: { lat: number; lon: number } | null,
  replace_grid: boolean
) =>
  invoke<void>("place_checkin_later", {
    checkinId: checkin_id,
    text,
    nearLat: near?.lat ?? null,
    nearLon: near?.lon ?? null,
    replaceGrid: replace_grid,
  });

/** The same for a spotter report. */
export const placeReportLater = (report_id: string, text: string, near: { lat: number; lon: number } | null) =>
  invoke<void>("place_report_later", { reportId: report_id, text, nearLat: near?.lat ?? null, nearLon: near?.lon ?? null });

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

// Repeater and net lists to share (shared-lists.md).
export type ListKind = "repeaters" | "nets";
export const exportList = (kind: ListKind, path: string) => invoke<number>("export_list", { kind, path });
export const inspectList = (kind: ListKind, path: string) =>
  invoke<ImportSummary>("inspect_list", { kind, path });
export const importList = (kind: ListKind, path: string, operator_id: string | null) =>
  invoke<ImportSummary>("import_list", { kind, path, operatorId: operator_id });

/** The copy saved before this launch upgraded the database, if it did. */
export const upgradeBackup = () => invoke<UpgradeBackup | null>("upgrade_backup");

export const startActivity = (activity_id: string, operator_id: string | null) =>
  invoke<void>("start_activity", { activityId: activity_id, operatorId: operator_id });

export const closeActivity = (
  activity_id: string,
  conclusion: string | null,
  operator_id: string | null,
  /** RFC 3339; null for now. */
  ended_at: string | null = null
) =>
  invoke<void>("close_activity", {
    activityId: activity_id,
    conclusion,
    operatorId: operator_id,
    endedAt: ended_at,
  });

/** Corrects when an activity started and (if closed) ended, without reopening it. */
export const setActivityTimes = (
  activity_id: string,
  opened_at: string,
  closed_at: string | null,
  operator_id: string | null
) =>
  invoke<void>("set_activity_times", {
    activityId: activity_id,
    openedAt: opened_at,
    closedAt: closed_at,
    operatorId: operator_id,
  });

export const reopenActivity = (activity_id: string, reason: string, operator_id: string | null) =>
  invoke<void>("reopen_activity", { activityId: activity_id, reason, operatorId: operator_id });

export const activitySummary = (activity_id: string) =>
  invoke<ActivitySummary>("activity_summary", { activityId: activity_id });

export const activityHistory = (activity_id: string) =>
  invoke<HistoryEntry[]>("activity_history", { activityId: activity_id });

// Relay station (docs/features/relay-station.md).

export const listRelayMessages = (activity_id: string) =>
  invoke<RelayMessage[]>("list_relay_messages", { activityId: activity_id });

export const listRemovedRelayMessages = (activity_id: string) =>
  invoke<RelayMessage[]>("list_removed_relay_messages", { activityId: activity_id });

export const createRelayMessage = (
  activity_id: string,
  message: RelayMessageInput,
  operator_id: string | null
) => invoke<string>("create_relay_message", { activityId: activity_id, message, operatorId: operator_id });

export const updateRelayMessage = (
  message_id: string,
  message: RelayMessageInput,
  operator_id: string | null
) => invoke<void>("update_relay_message", { messageId: message_id, message, operatorId: operator_id });

export const addRelayStep = (message_id: string, step: RelayStepInput, operator_id: string | null) =>
  invoke<string>("add_relay_step", { messageId: message_id, step, operatorId: operator_id });

export const undoRelayStep = (step_id: string, operator_id: string | null) =>
  invoke<void>("undo_relay_step", { stepId: step_id, operatorId: operator_id });

export const voidRelayMessage = (message_id: string, reason: string | null, operator_id: string | null) =>
  invoke<void>("void_relay_message", { messageId: message_id, reason, operatorId: operator_id });

export const restoreRelayMessage = (message_id: string, operator_id: string | null) =>
  invoke<void>("restore_relay_message", { messageId: message_id, operatorId: operator_id });
