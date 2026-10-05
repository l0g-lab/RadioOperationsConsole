export interface Operator {
  id: string;
  display_name: string;
  call_sign: string;
  location_label: string;
  location_lat: number | null;
  location_lon: number | null;
}

export interface Activity {
  id: string;
  title: string;
  activity_type: string;
  scheduled_at: string;
  frequency: string;
  location_label: string;
  location_lat: number | null;
  location_lon: number | null;
  /** "scheduled" (not started), "active" (open) or "closed". */
  state: string;
  /** When it was started / closed (UTC, RFC 3339), or empty. */
  opened_at: string;
  closed_at: string;
  /** The operator's closing notes, or empty. */
  conclusion: string;
  /**
   * The repeater it runs on, copied from the directory or placed by hand;
   * apart from `location`, which is where net control is. "" / null if none.
   */
  repeater_name: string;
  repeater_lat: number | null;
  repeater_lon: number | null;
  /** The operator running it (net control); "" if none was set. */
  operator_id: string;
  /** The event it belongs to (an `EventRecord`'s id) and that event's name; "" if none. */
  event_id: string;
  event: string;
}

/** "none", "pl" (CTCSS) or "dcs". */
export type ToneKind = "none" | "pl" | "dcs";

/** What's entered for a repeater (repeater-directory.md). */
export interface RepeaterDetails {
  name: string;
  output_mhz: number;
  /** Signed: input = output + offset. 0 is simplex. */
  offset_mhz: number;
  tone_in_kind: ToneKind;
  /** "100.0" for PL, "023N" / "023I" for DCS, "" for none. */
  tone_in: string;
  tone_out_kind: ToneKind;
  tone_out: string;
  mode: string;
  location_label: string;
  location_lat: number | null;
  location_lon: number | null;
  notes: string;
}

/** ICS 214 section 6: a resource assigned. */
export interface Ics214Resource {
  name: string;
  position: string;
  agency: string;
}

/** ICS 214 section 7: a line of the activity log. */
export interface Ics214Line {
  /** RFC 3339. */
  at: string;
  text: string;
  /** The record it was made from ("start:<activity id>"), or null if added by hand. */
  source: string | null;
}

/** An ICS 214 activity log as entered (ics-form-exports.md, ICSF-050–056). */
export interface Ics214Details {
  incident_name: string;
  /** RFC 3339. */
  period_from: string;
  period_to: string;
  name: string;
  ics_position: string;
  home_agency: string;
  prepared_name: string;
  resources: Ics214Resource[];
  excluded_activities: string[];
  lines: Ics214Line[];
  /** Sources of generated lines the operator deleted. */
  dismissed: string[];
  /** The event this is the log of, if any. */
  event_id?: string | null;
}

export interface Ics214Log extends Ics214Details {
  id: string;
  updated_at: string;
}

/** A saved place net control often operates from (saved-places.md). */
export interface PlaceDetails {
  name: string;
  lat: number;
  lon: number;
  notes: string;
}

export interface Place extends PlaceDetails {
  id: string;
}

/** How often a listed net meets (net-listings.md). */
export type ScheduleKind = "weekly" | "monthly" | "as_needed";

/** What's entered for a net listing. */
export interface NetListingDetails {
  name: string;
  activity_type: string;
  /** A repeater from the directory, or null for free-text frequency. */
  repeater_id: string | null;
  frequency: string;
  schedule_kind: ScheduleKind;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  /** Monthly only: "1"–"4" or "last". */
  weeks: string[];
  /** Local "HH:MM"; "" for as needed. */
  start_time: string;
  /** Optional local "HH:MM". */
  end_time: string;
  run_by: string;
  /** What to know before checking in ("call sign and name, mobiles first"). */
  checkin_info: string;
  notes: string;
}

export interface NetListing extends NetListingDetails {
  id: string;
  /** When it was retired, or "" while in use. */
  retired_at: string;
}

export interface Repeater extends RepeaterDetails {
  id: string;
  /** When it was retired, or "" while in use. */
  retired_at: string;
}

/** How many records an activity holds, or held before it was permanently deleted. */
export interface DeletedCounts {
  checkins: number;
  spotter_reports: number;
  /** Missing from deletions recorded before relay messages existed. */
  relay_messages?: number;
}

export interface Checkin {
  id: string;
  call_sign: string;
  name: string;
  qth_location: string;
  grid_square: string;
  address: string;
  checked_in_at: string;
  location_lat: number | null;
  location_lon: number | null;
  location_label: string;
  /** Placed by hand, so Lookup and edits leave it alone. */
  location_manual: boolean;
  /** The station has traffic to pass; `traffic` holds the details, if any yet. */
  has_traffic: boolean;
  traffic: string;
  traffic_handled: boolean;
  /** Radio details of a contact (station logs); "" when not recorded. */
  frequency: string;
  mode: string;
  rst_sent: string;
  rst_received: string;
  power: string;
  antenna: string;
  notes: string;
  /** Range checks: "mobile", "base" or "ht", and the cross street given; "" when not recorded. */
  station_kind: string;
  cross_street: string;
}

/**
 * A contact's radio details as entered. Every field is optional; the keys
 * are the backend's own names. `contacted_at` (RFC 3339) left out means "now"
 * when logging and "unchanged" when correcting.
 */
export interface ContactDetails {
  contacted_at?: string | null;
  frequency?: string | null;
  mode?: string | null;
  rst_sent?: string | null;
  rst_received?: string | null;
  power?: string | null;
  antenna?: string | null;
  notes?: string | null;
  station_kind?: string | null;
  cross_street?: string | null;
}

/** Earlier records of a call sign across every activity ("worked before"). */
export interface StationHistory {
  count: number;
  last: {
    activity_id: string;
    activity_title: string;
    at: string;
    /** Most recent name/QTH on record, even if the latest contact left them blank. */
    name: string;
    qth_location: string;
    frequency: string;
  } | null;
}

export const HAZARD_TYPES = [
  "Hail",
  "Wind Damage",
  "Flooding",
  "Tornado",
  "Snow/Ice Accumulation",
  "Other",
] as const;

/**
 * Standard magnitude options per hazard type, so a spotter picks from the
 * same reference scale NWS trains SKYWARN spotters on rather than typing
 * a description that may not match NWS's own reporting categories.
 *
 * Hail and Wind Damage are sourced directly from official NWS spotter
 * reference material: the hail size/common-object correlation chart and
 * wind speed/damage-indicator scale published by NWS Burlington
 * (weather.gov/media/twc/WindHailReference.pdf) and NWS Detroit/Pontiac's
 * 2023 Spotter Reference Guide (weather.gov/media/dtx/spotter). Flooding
 * and Tornado have no official numeric scale in SKYWARN training — floods
 * are reported by impact, not depth, and tornado magnitude (EF rating) is
 * assigned by NWS after a post-event damage survey, never by the spotter
 * — so those lists are qualitative categories reflecting how spotters are
 * actually trained to describe them, not a fabricated numeric scale.
 * Snow/Ice accumulation reporting increments follow NWS's published
 * "report the first inch, then every additional 2 inches" guidance.
 * "Other" has no fixed list; it stays free text.
 */
export const HAZARD_MAGNITUDE_OPTIONS: Record<string, readonly string[]> = {
  Hail: [
    "0.25 in (Pea)",
    "0.50 in (Plain M&M)",
    "0.75 in (Penny)",
    "0.88 in (Nickel)",
    "1.00 in (Quarter) — Severe threshold",
    "1.25 in (Half Dollar)",
    "1.50 in (Ping Pong Ball)",
    "1.75 in (Golf Ball)",
    "2.00 in (Lime)",
    "2.50 in (Tennis Ball)",
    "2.75 in (Baseball)",
    "3.00 in (Large Apple)",
    "4.00 in (Softball)",
    "4.50 in (Grapefruit)",
  ],
  "Wind Damage": [
    "8-12 mph (Gentle Breeze)",
    "13-18 mph (Moderate Breeze)",
    "19-24 mph (Fresh Breeze)",
    "25-31 mph (Strong)",
    "32-38 mph (Very Strong Wind)",
    "39-49 mph (Gale Force)",
    "50-57 mph (Near Severe)",
    "58-73 mph (Severe Storm) — Severe threshold",
    "74-89 mph (Hurricane Force, Cat 1)",
    "90+ mph (Destructive Wind)",
  ],
  Flooding: [
    "Water covering roadway (passable)",
    "Roadway impassable",
    "Water entering yards/property",
    "Water entering structures",
    "Water above door level",
  ],
  Tornado: [
    "Funnel cloud (no ground contact)",
    "Tornado (on ground, no visible debris)",
    "Tornado (debris/damage observed)",
    "Waterspout",
  ],
  "Snow/Ice Accumulation": [
    "Trace (<1 in)",
    "1 in",
    "2 in",
    "3 in",
    "4 in",
    "6 in",
    "8 in",
    "12 in",
    "More than 12 in",
    "Ice glazing: 1/4 in",
    "Ice glazing: 1/2 in",
    "Ice glazing: 3/4 in or more",
  ],
  Other: [],
};

export interface WindDamageGuideEntry {
  range: string;
  label: string;
  description: string;
}

/**
 * Damage-indicator descriptions for each Wind Damage magnitude bucket, so
 * a net control operator can ask "did you see whole trees moving, or
 * branches breaking?" and pick the matching magnitude when a caller has
 * no anemometer and doesn't know the wind speed. Sourced from the same
 * NWS spotter reference material as `HAZARD_MAGNITUDE_OPTIONS["Wind
 * Damage"]` (NWS Burlington's WindHailReference.pdf) — same order and
 * ranges as that list, so the two stay usable side by side.
 */
export const WIND_DAMAGE_GUIDE: WindDamageGuideEntry[] = [
  { range: "8-12 mph", label: "Gentle Breeze", description: "Leaves and small twigs in constant motion; light flag extends" },
  { range: "13-18 mph", label: "Moderate Breeze", description: "Raises dust and loose paper; small branches move" },
  { range: "19-24 mph", label: "Fresh Breeze", description: "Small trees begin to sway" },
  { range: "25-31 mph", label: "Strong", description: "Large branches in motion; whistling in telephone wires; umbrellas hard to use" },
  { range: "32-38 mph", label: "Very Strong Wind", description: "Whole trees in motion; loose lawn furniture tossed; walking becomes difficult" },
  { range: "39-49 mph", label: "Gale Force", description: "Small trees bend; twigs and small branches under 2 in break off" },
  { range: "50-57 mph", label: "Near Severe", description: "Limbs 2-3 in or larger break; very small trees blow over; minor damage to old/weak structures" },
  { range: "58-73 mph", label: "Severe Storm", description: "Large limbs break; shallow-rooted trees pushed over; shingles/awnings removed — Severe threshold" },
  { range: "74-89 mph", label: "Hurricane Force (Cat 1)", description: "Widespread tree damage, some snapped/uprooted; mobile homes significantly damaged; some roof damage to homes" },
  { range: "90+ mph", label: "Destructive Wind", description: "Many large trees snapped/uprooted; severe damage to mobile homes; moderate to severe roof damage to homes" },
];

export const REPORT_SOURCES = [
  "Amateur Radio Spotter",
  "Trained Spotter",
  "Emergency Management",
  "Public",
  "Law Enforcement",
] as const;

/** One packet from a live APRS-IS area feed (see `startAprsIsStream`). */
export interface AprsIsPacket {
  source: string;
  dest: string;
  path: string;
  raw: string;
  lat: number | null;
  lon: number | null;
  comment: string | null;
  symbol: string | null;
  received_at: string;
}

export interface SpotterReport {
  id: string;
  activity_id: string;
  operator_id: string;
  reported_at: string;
  county: string;
  location_text: string;
  lat: number | null;
  lon: number | null;
  reporter: string;
  hazard_type: string;
  magnitude: string;
  source: string;
  notes: string;
  checkin_id: string | null;
}

export interface AuditEvent {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  data: string;
  created_at: string;
}

export interface AppSettings {
  nws_api_key: string;
  qrz_username: string;
  qrz_password: string;
  weather_area_query: string;
  weather_area_label: string;
  weather_area_lat: number | null;
  weather_area_lon: number | null;
  weather_area_resolved_at: string | null;
  /** "Work offline" (UX-020). Set from the header, not saved by the Settings form. */
  work_offline?: boolean;
}

export interface QrzLookupResponse {
  call_sign: string;
  name: string | null;
  qth_location: string | null;
  grid_square: string | null;
  address: string | null;
  /** QRZ's own point for the station — only set when QRZ says it's exact (geocoded/user-supplied), never a rounded grid/ZIP. */
  exact_lat: number | null;
  exact_lon: number | null;
  geoloc: string | null;
}

/** Status of the offline call-sign directory (built from the FCC's license database). */
export interface CallsignPackStatus {
  installed: boolean;
  record_count: number;
  generated_at: string;
  source: string;
  size_bytes: number;
  /** False for a file downloaded before street addresses were included. */
  has_street_addresses: boolean;
}

/** Which FCC license file an offline directory is built from. */
export type LicenseService = "amateur" | "gmrs";

export interface OfflineCallRecord {
  call: string;
  name: string;
  /** Street or PO box line; empty for an older file or when the FCC has none. */
  street: string;
  city: string;
  state: string;
  zip: string;
  coords: [number, number] | null;
}

export interface OfflineCallLookup {
  /** False when the directory hasn't been downloaded (so "not found" isn't ambiguous). */
  installed: boolean;
  record: OfflineCallRecord | null;
  /** False for a file downloaded before street addresses were included. */
  has_street_addresses: boolean;
}

/** Progress of a long-running data download, streamed from the backend. */
export interface DatapackProgress {
  id: string;
  phase: "downloading" | "reading" | "saving";
  done: number;
  total: number;
}

/** An offline data pack (see Settings -> Offline Data). */
export interface DataPackInfo {
  id: string;
  name: string;
  description: string;
  /** "bundled" ships with the app; "downloaded" was refreshed by the operator. */
  origin: "bundled" | "downloaded";
  generated_at: string;
  anchor_count: number;
  first_mile: number | null;
  last_mile: number | null;
  source: string;
}

/** A mile-marker reference resolved locally, e.g. "mile marker 182 on turnpike". */
export interface MileMarkerHit {
  lat: number;
  lon: number;
  label: string;
  route_id: string;
  mile: number;
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  display_name: string | null;
}

/** Stable error sentinels from the QRZ and geocoding commands (see commands.rs). */
export const QRZ_ERR_NOT_CONFIGURED = "not_configured";
export const ERR_OFFLINE = "offline";

export const TABS = [
  "Operations",
  "Check-ins",
  "Spotter Reports",
  "Weather",
  "APRS",
  "History",
  // Before Settings, so the working tabs keep their Ctrl+number (NETL-019).
  "Nets",
  "Events",
  // Ctrl+0.
  "Settings",
] as const;

export type Tab = (typeof TABS)[number];

/** What's inside a database backup file. */
export interface BackupSummary {
  operators: number;
  activities: number;
  checkins: number;
  spotter_reports: number;
  size_bytes: number;
  /** RFC 3339 time the file was last written, or empty. */
  modified: string;
}

/** A newer release on GitHub (src-tauri/src/updates.rs). */
export interface UpdateInfo {
  version: string;
  current_version: string;
  /** The release's notes. */
  notes: string;
  /** The release's page, for when there's no installer to fetch. */
  release_url: string;
  /** The installer for this computer; null when running a build from source. */
  installer: { name: string; size: number } | null;
}

/** What opening a downloaded installer did. */
export type InstallerOpened = "installer_running" | "in_software_installer" | "app_image_ready";

/** The copy saved before this launch upgraded the database (path, or why it failed). */
export interface UpgradeBackup {
  path: string | null;
  error: string | null;
}

export interface RestoreResult {
  /** Where the data that was replaced was saved first. */
  safety_copy: string;
  summary: BackupSummary;
}

/** Counts and times for one activity, for wrapping up a net and its summary. */
export interface ActivitySummary {
  state: string;
  opened_at: string;
  closed_at: string;
  conclusion: string;
  checkins: number;
  unique_stations: number;
  removed_checkins: number;
  first_checkin_at: string;
  last_checkin_at: string;
  spotter_reports: number;
  /** Spotter reports by hazard type, most numerous first. */
  hazards: { hazard_type: string; count: number }[];
  traffic_items: number;
  /** Check-ins with traffic that isn't marked handled. */
  open_traffic_items: number;
  /** Messages received to relay. */
  relay_messages: number;
  /** Relay messages not yet passed on or given up on. */
  held_relay_messages: number;
  /** Relay messages that couldn't be passed on. */
  unpassed_relay_messages: number;
  /** The weather as it started and ended, or why there's none (start first). */
  weather: ActivityWeather[];
}

export type WeatherOutcome = "ok" | "offline" | "no_place" | "error" | "no_reading";

/** The weather read as an activity started or ended (net-weather.md). */
export interface ActivityWeather {
  moment: "start" | "end";
  /** "ok" for a reading; otherwise why there's none. */
  outcome: WeatherOutcome;
  /** Where it was read for; empty without a reading. */
  place: "repeater" | "net_control" | "";
  station_id: string;
  station_name: string;
  observed_at: string;
  temp_c: number | null;
  conditions: string;
  wind_dir_deg: number | null;
  wind_speed_kmh: number | null;
  wind_gust_kmh: number | null;
  /** NWS alerts in effect there, e.g. "Severe Thunderstorm Warning". */
  alerts: string[];
}

/** One line of an activity's history, with the operator who made it. */
export interface HistoryEvent {
  id: string;
  /** "activity", "checkin", "spotter_report" or "relay_message". */
  entity_type: string;
  entity_id: string;
  action: string;
  data: string;
  operator: string;
  created_at: string;
}

/** Something kept on this computer besides the records (STORE-001). */
export type StorageItemId =
  | "callsigns-amateur"
  | "callsigns-gmrs"
  | "road-data"
  | "partial-downloads"
  | "restore-copies";

export interface StorageItem {
  id: StorageItemId;
  files: number;
  bytes: number;
  /** The folder its files are kept in. */
  location: string;
}

/** A message received to pass on, as entered (docs/features/relay-station.md). */
export interface RelayMessageInput {
  /** RFC 3339. */
  received_at: string;
  from_station: string;
  for_station: string;
  message: string;
  /** The frequency, repeater, or other means it came in on. */
  received_via: string;
  /** The message this answers. */
  reply_to: string | null;
}

export type RelayStepKind = "attempt" | "passed" | "not_passed";

/** A step in passing a message on, as entered. */
export interface RelayStepInput {
  kind: RelayStepKind;
  /** RFC 3339. */
  at: string;
  /** Who it was passed (or tried) to. */
  station: string;
  /** The frequency, repeater, or other means used. */
  via: string;
  note: string;
}

export interface RelayStep extends RelayStepInput {
  id: string;
}

export type RelayStatus = "held" | "passed" | "not_passed";

export interface RelayMessage extends RelayMessageInput {
  id: string;
  activity_id: string;
  status: RelayStatus;
  /** Oldest first. */
  steps: RelayStep[];
  voided_at: string;
  void_reason: string;
}

/** An activity an operator is named in (`OperatorUsage`). */
export interface OperatorActivityUse {
  id: string;
  title: string;
  /** They're its operator (net control). */
  runs: boolean;
  checkins: number;
  spotter_reports: number;
  /** Relay messages and steps. */
  relay: number;
  /** History entries they made on it or its records. */
  history: number;
}

/** Where an operator is named, shown when removing them (AUDIT-013). */
export interface OperatorUsage {
  activities: OperatorActivityUse[];
  /** Their history entries on anything outside an activity, by kind. */
  other_history: { kind: string; count: number }[];
}

/** An event (docs/features/events.md): an occasion holding its activities and its ICS 214. */
export interface EventRecord {
  id: string;
  name: string;
  /** YYYY-MM-DD, or "". */
  date: string;
}
