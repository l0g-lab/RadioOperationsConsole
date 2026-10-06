import { open, save } from "@tauri-apps/plugin-dialog";
import { mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import * as api from "./api";
import type { Activity, ActivitySummary, Checkin, HistoryEntry, RelayMessage, SpotterReport } from "./types";
import { stationKindLabel } from "./rangeCheck";
import { formatTimeLines, pad2, splitScheduledAt } from "./utils";
import { activityTypeLabel, isLog } from "./activityTypes";
import { weatherLines } from "./netWeather";
import { latLonToGridSquare } from "./grid";
import { formatCoords } from "./geo";
import { summaryFacts } from "./summaryFacts";
import { relayStatusLabel } from "./relay";
import { describeHistory, historyPlain } from "./historyText";

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
  // The app may only write where the dialog allowed, so the backend grants
  // that one name with the extension added.
  const path =
    ext && !chosen.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
      ? await api.allowExportExtension(chosen, ext)
      : chosen;
  await writeTextFile(path, content);
  return path;
}

const FILE_TYPE_NAMES: Record<string, string> = {
  csv: "CSV spreadsheet",
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

/**
 * Reads CSV back into rows — the reverse of `csv`, so a preview shows exactly
 * what's saved: quoted fields, doubled quotes, and line breaks inside quotes.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
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
  "Station Type",
  "Cross Street",
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
      c.station_kind ? stationKindLabel(c.station_kind) : "",
      c.cross_street,
    ]);
  }
  return csv(rows);
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
    // Lets the app write into subfolders it creates there, and nowhere else.
    recursive: true,
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

/** The summary's weather: "Weather (start): 79°F, …; Severe Thunderstorm Warning", or why there's none. */
function weatherTextLines(s: ActivitySummary): string[] {
  return weatherLines(s.weather).map(
    (l) => `Weather (${l.label.toLowerCase()}): ${[l.text, ...l.alerts].join("; ")}`
  );
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
    ...(isLog(activity.activity_type) ? [] : weatherTextLines(s)),
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

/**
 * The full history of an activity, oldest first, as the History tab says it
 * (AUDIT-022): both times, what happened in words, and who did it; then, for
 * the record, the kind of record, the stored action, the data as recorded
 * (every before/after value of a correction), and the record's id.
 * `operatorName` names an operator by id, for a change of who runs the net.
 */
export function historyToCsv(
  events: HistoryEntry[],
  operatorName: (id: string) => string | null = () => null
): string {
  return csv([
    ["Time (Local)", "Time (UTC)", "What Happened", "Who", "Record Type", "Action", "Recorded Data", "Record Id"],
    ...events.map((e) => [
      localStamp(e.created_at),
      utcStamp(e.created_at),
      historyPlain(describeHistory(e, operatorName)),
      e.operator,
      e.entity_type,
      e.action,
      e.data,
      e.entity_id,
    ]),
  ]);
}

const RELAY_CSV_COLUMNS = [
  "Received (local)",
  "Received (UTC)",
  "From",
  "For",
  "Received via",
  "Message",
  "Reply to",
  "Status",
  "Passed (local)",
  "Passed (UTC)",
  "Passed to",
  "Passed via",
  "Failed attempts",
  "Not passed because",
];

/**
 * Relayed messages, one row each, oldest first: how each came in and what
 * became of it (RELAY-040). Failed attempts are listed in one column.
 */
export function relayMessagesToCsv(messages: RelayMessage[]): string {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const rows = [RELAY_CSV_COLUMNS];
  for (const m of [...messages].sort((a, b) => a.received_at.localeCompare(b.received_at))) {
    const passed = m.steps.find((s) => s.kind === "passed");
    const gaveUp = m.steps.find((s) => s.kind === "not_passed");
    const original = m.reply_to ? byId.get(m.reply_to) : undefined;
    rows.push([
      localStamp(m.received_at),
      utcStamp(m.received_at),
      m.from_station,
      m.for_station,
      m.received_via,
      m.message,
      original ? `${original.from_station} to ${original.for_station}, ${localStamp(original.received_at)}` : "",
      relayStatusLabel(m.status),
      passed ? localStamp(passed.at) : "",
      passed ? utcStamp(passed.at) : "",
      passed?.station ?? "",
      passed?.via ?? "",
      m.steps
        .filter((s) => s.kind === "attempt")
        .map((s) => `${localStamp(s.at)} via ${s.via}${s.station ? ` to ${s.station}` : ""}${s.note ? `: ${s.note}` : ""}`)
        .join("; "),
      gaveUp?.note ?? "",
    ]);
  }
  return csv(rows);
}
