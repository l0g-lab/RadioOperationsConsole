import { open, save } from "@tauri-apps/plugin-dialog";
import { mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import type { Activity, ActivitySummary, Checkin, HistoryEvent, SpotterReport } from "./types";
import { formatTimeLines, pad2, splitScheduledAt } from "./utils";
import { activityTypeLabel } from "./activityTypes";
import { latLonToGridSquare } from "./grid";
import { formatCoords } from "./geo";
import { summaryFacts } from "./summaryFacts";

/**
 * Prompts the operator with a native "Save As" dialog and writes the
 * content to whatever path they choose, returning that exact path so the
 * caller can report exactly where the file went — a browser-style
 * Blob/anchor download can't do this, since the webview's own download
 * manager picks the destination without ever telling the page what it
 * chose. Returns null if the operator cancels the dialog.
 */
export async function saveTextFile(
  defaultFilename: string,
  content: string
): Promise<string | null> {
  const ext = defaultFilename.match(/\.([a-z0-9]+)$/i)?.[1] ?? "";
  const chosen = await save({
    defaultPath: defaultFilename,
    filters: ext
      ? [
          {
            name: FILE_TYPE_NAMES[ext.toLowerCase()] ?? ext.toUpperCase(),
            extensions: [ext],
          },
        ]
      : undefined,
  });
  if (!chosen) return null;
  // Some dialogs (GTK in particular) don't add the filter's extension when the
  // operator types a name without one, which leaves a file nothing will open.
  const path =
    ext && !chosen.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? `${chosen}.${ext}` : chosen;
  await writeTextFile(path, content);
  return path;
}

const FILE_TYPE_NAMES: Record<string, string> = {
  csv: "CSV spreadsheet",
  json: "JSON",
  txt: "Text",
  html: "Web page (HTML)",
  xml: "XML",
};

/**
 * The suggested name for an exported file: "Tuesday Net - 2026-09-21 1904 - Check-ins.csv".
 * The date and time are local: when the activity was started, or its scheduled
 * time if it hasn't been, and left out if it has neither.
 */
export function exportFilename(activity: Activity, kind: string, ext: string): string {
  const title =
    activity.title
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/, "") || "Activity";
  return [title, activityStamp(activity), kind].filter(Boolean).join(" - ") + `.${ext}`;
}

/** "2026-09-21 1904" (local), "2026-09-21" for a date-only schedule, or "". */
function activityStamp(activity: Activity): string {
  const opened = new Date(activity.opened_at);
  if (activity.opened_at && !Number.isNaN(opened.getTime())) {
    return (
      `${opened.getFullYear()}-${pad2(opened.getMonth() + 1)}-${pad2(opened.getDate())} ` +
      `${pad2(opened.getHours())}${pad2(opened.getMinutes())}`
    );
  }
  const { date, time } = splitScheduledAt(activity.scheduled_at);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return time ? `${date} ${time.replace(":", "")}` : date;
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Times are written both ways: local (what the operator saw on the clock) and
// UTC (unambiguous), so an export can be read by a person or matched to another
// record without guessing the time zone.

/** "2026-09-21 19:04:00" in local time, or "" if the text isn't a date. */
function localStamp(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

/** "2026-09-21T23:04:00Z", or "" if the text isn't a date. A time with no zone is read as local. */
function utcStamp(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function csv(rows: string[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

const CSV_COLUMNS = [
  "Call Sign",
  "Name",
  "Location",
  "Grid Square",
  "Address",
  "Latitude",
  "Longitude",
  "Location Label",
  "Checked In (Local)",
  "Checked In (UTC)",
  "Has Traffic",
  "Traffic",
  "Traffic Handled",
  "Frequency",
  "Mode",
  "RST Sent",
  "RST Received",
  "Power",
  "Antenna",
  "Notes",
];

/** The active (non-voided) roster as CSV, with everything the roster shows. */
export function checkinsToCsv(checkins: Checkin[]): string {
  const rows = [CSV_COLUMNS];
  for (const c of checkins) {
    rows.push([
      c.call_sign,
      c.name,
      c.qth_location,
      c.grid_square,
      c.address,
      c.location_lat != null ? String(c.location_lat) : "",
      c.location_lon != null ? String(c.location_lon) : "",
      c.location_label,
      localStamp(c.checked_in_at),
      utcStamp(c.checked_in_at),
      c.has_traffic ? "yes" : "",
      c.traffic,
      c.has_traffic ? (c.traffic_handled ? "yes" : "no") : "",
      c.frequency,
      c.mode,
      c.rst_sent,
      c.rst_received,
      c.power,
      c.antenna,
      c.notes,
    ]);
  }
  return csv(rows);
}

function checkinRecord(c: Checkin) {
  return {
    call_sign: c.call_sign,
    name: c.name,
    qth_location: c.qth_location,
    grid_square: c.grid_square,
    address: c.address,
    lat: c.location_lat,
    lon: c.location_lon,
    location_label: c.location_label,
    checked_in_local: localStamp(c.checked_in_at),
    checked_in_utc: utcStamp(c.checked_in_at),
    has_traffic: c.has_traffic,
    traffic: c.traffic,
    traffic_handled: c.traffic_handled,
    frequency: c.frequency,
    mode: c.mode,
    rst_sent: c.rst_sent,
    rst_received: c.rst_received,
    power: c.power,
    antenna: c.antenna,
    notes: c.notes,
  };
}

/** The active (non-voided) roster as JSON, with activity context for reference. */
export function checkinsToJson(activity: Activity | null, checkins: Checkin[]): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      activity: activity && {
        id: activity.id,
        title: activity.title,
        activity_type: activity.activity_type,
        scheduled_at: activity.scheduled_at,
        frequency: activity.frequency,
      },
      checkins: checkins.map(checkinRecord),
    },
    null,
    2
  );
}

/**
 * Asks for a folder, then writes each file into it (creating subfolders as
 * needed). `path` is relative, with "/" between folders. Returns the chosen
 * folder, or null if the operator cancels.
 */
export async function saveFilesToFolder(
  files: { path: string; content: string }[]
): Promise<string | null> {
  const chosen = await open({
    directory: true,
    multiple: false,
    title: "Choose a folder to save into",
  });
  if (!chosen || Array.isArray(chosen)) return null;
  for (const f of files) {
    const parts = f.path.split("/");
    const dir = await join(chosen, ...parts.slice(0, -1));
    if (parts.length > 1) await mkdir(dir, { recursive: true });
    await writeTextFile(await join(dir, parts[parts.length - 1]), f.content);
  }
  return chosen;
}

/** Length of time between two RFC 3339 instants as "2 h 15 min", or "" if either is missing. */
export function formatDuration(fromIso: string, toIso: string): string {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return "";
  const minutes = Math.round((b - a) / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** A plain-text net summary, for saving or pasting into a report or email. */
export function activitySummaryToText(activity: Activity, s: ActivitySummary): string {
  const when = (iso: string) => {
    const t = formatTimeLines(iso);
    return t.utc ? `${t.local.replace("Local: ", "")} (${t.utc.replace("UTC: ", "")})` : t.local;
  };
  const lines = [
    activity.title,
    [activityTypeLabel(activity.activity_type), activity.scheduled_at, activity.frequency]
      .filter(Boolean)
      .join(" · "),
    activity.location_label ? `Location: ${activity.location_label}` : "",
    "",
    s.opened_at ? `Started: ${when(s.opened_at)}` : "Not started",
    s.closed_at ? `Ended:   ${when(s.closed_at)}` : "",
    s.opened_at && s.closed_at ? `Duration: ${formatDuration(s.opened_at, s.closed_at)}` : "",
    "",
    ...summaryFacts(activity.activity_type, s).map((f) =>
      [f.text, f.detail].filter(Boolean).join(" ")
    ),
    "",
    s.conclusion ? `Conclusion:\n${s.conclusion}` : "",
  ];
  return (
    lines
      .filter((l, i) => l !== "" || (i > 0 && lines[i - 1] !== ""))
      .join("\n")
      .trim() + "\n"
  );
}

// ---------------------------------------------------------------- spotter reports

const SPOTTER_CSV_COLUMNS = [
  "Reporter",
  "Source",
  "Reported (Local)",
  "Reported (UTC)",
  "Hazard Type",
  "Magnitude",
  "Notes",
  "County",
  "Location",
  "Latitude",
  "Longitude",
  "Grid Square",
];

/** Oldest first, the order events happened in. */
function chronological(reports: SpotterReport[]): SpotterReport[] {
  return [...reports].sort((a, b) => a.reported_at.localeCompare(b.reported_at));
}

function reportGrid(r: SpotterReport): string {
  return r.lat != null && r.lon != null ? latLonToGridSquare(r.lat, r.lon) : "";
}

/** Spotter reports as CSV, in the same who / what / where order as the form. */
export function spotterReportsToCsv(reports: SpotterReport[]): string {
  const rows = [SPOTTER_CSV_COLUMNS];
  for (const r of chronological(reports)) {
    rows.push([
      r.reporter,
      r.source,
      localStamp(r.reported_at),
      utcStamp(r.reported_at),
      r.hazard_type,
      r.magnitude,
      r.notes,
      r.county,
      r.location_text,
      r.lat != null ? String(r.lat) : "",
      r.lon != null ? String(r.lon) : "",
      reportGrid(r),
    ]);
  }
  return csv(rows);
}

function reportRecord(r: SpotterReport) {
  return {
    reporter: r.reporter,
    source: r.source,
    reported_local: localStamp(r.reported_at),
    reported_utc: utcStamp(r.reported_at),
    hazard_type: r.hazard_type,
    magnitude: r.magnitude,
    notes: r.notes,
    county: r.county,
    location_text: r.location_text,
    lat: r.lat,
    lon: r.lon,
    grid_square: reportGrid(r) || null,
    linked_checkin_id: r.checkin_id,
  };
}

/** Spotter reports as JSON, with the activity for context. */
export function spotterReportsToJson(activity: Activity | null, reports: SpotterReport[]): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      activity: activity && {
        id: activity.id,
        title: activity.title,
        activity_type: activity.activity_type,
        scheduled_at: activity.scheduled_at,
      },
      spotter_reports: chronological(reports).map(reportRecord),
    },
    null,
    2
  );
}

/** A readable text report, for pasting into an email or message. */
export function spotterReportsToText(activity: Activity | null, reports: SpotterReport[]): string {
  const sorted = chronological(reports);
  const lines = [
    `Spotter reports${activity ? ` — ${activity.title}` : ""}`,
    `${sorted.length} report${sorted.length === 1 ? "" : "s"}`,
    "",
  ];
  sorted.forEach((r, i) => {
    const what = [r.hazard_type, r.magnitude].filter(Boolean).join(" — ");
    const where = [r.location_text, r.county && `${r.county} County`].filter(Boolean).join(", ");
    const point =
      r.lat != null && r.lon != null
        ? `${formatCoords(r.lat, r.lon)} (${latLonToGridSquare(r.lat, r.lon)})`
        : "";
    const utc = utcStamp(r.reported_at);
    lines.push(`${i + 1}. ${r.reported_at.replace("T", " ")}${utc ? ` (${utc})` : ""} — ${what}`);
    lines.push(
      `   Reported by: ${[r.reporter, r.source && `(${r.source})`].filter(Boolean).join(" ") || "unknown"}`
    );
    if (where) lines.push(`   Location: ${where}`);
    if (point) lines.push(`   Coordinates: ${point}`);
    if (r.notes) lines.push(`   Notes: ${r.notes}`);
    lines.push("");
  });
  return lines.join("\n").trimEnd() + "\n";
}

// ---------------------------------------------------------- log, history, package

function eventRows(events: HistoryEvent[]): string[][] {
  return events.map((e) => [
    localStamp(e.created_at),
    utcStamp(e.created_at),
    e.entity_type,
    e.action,
    e.operator,
    e.data,
    e.entity_id,
  ]);
}

/**
 * The full history of an activity: every start, close, correction, removal,
 * restore, log entry and traffic-handled mark, with the operator and both
 * times. `Detail` holds the event's own data as recorded (before/after values
 * for a correction).
 */
export function historyToCsv(events: HistoryEvent[]): string {
  return csv([
    ["Time (Local)", "Time (UTC)", "Record Type", "Action", "Operator", "Detail", "Record Id"],
    ...eventRows(events),
  ]);
}

/**
 * Everything about one activity in a single JSON file: the activity itself,
 * its summary, check-ins, spotter reports, and history.
 */
export function activityPackageToJson(
  activity: Activity,
  summary: ActivitySummary | null,
  checkins: Checkin[],
  reports: SpotterReport[],
  history: HistoryEvent[]
): string {
  return JSON.stringify(
    {
      format: "radio-ops-console-activity",
      format_version: 1,
      exported_at: new Date().toISOString(),
      activity: {
        ...activity,
        opened_at_local: localStamp(activity.opened_at) || null,
        closed_at_local: localStamp(activity.closed_at) || null,
      },
      summary,
      checkins: checkins.map(checkinRecord),
      spotter_reports: chronological(reports).map(reportRecord),
      history: history.map((e) => ({
        time_local: localStamp(e.created_at),
        time_utc: utcStamp(e.created_at),
        record_type: e.entity_type,
        action: e.action,
        operator: e.operator,
        detail: e.data,
        record_id: e.entity_id,
      })),
    },
    null,
    2
  );
}
