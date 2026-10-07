import type { Activity, Checkin, SpotterReport } from "./types";
import { spotterReportsToText } from "./export";
import { pad2 } from "./utils";

/**
 * ICS 309 (Communications Log) and ICS 213 (General Message), filled from the
 * activity's records: the 309 is the check-in list, the 213 carries spotter
 * reports. Each comes two ways:
 *
 *  - Winlink import data, to load into Winlink Express's own form: for the 213
 *    the form-data XML Winlink's ICS213_Initial form reads, and for the 309 the
 *    tab-delimited rows its "Paste Data from a Spreadsheet" box accepts.
 *  - A printable HTML file: open it in any browser and print it (or "Save as
 *    PDF"). The items are numbered and worded as on the forms, but the layout is
 *    ours, not a scan of an official form.
 */

// ------------------------------------------------------------------ helpers

export function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Text with line breaks kept. */
export function multiline(v: string): string {
  return esc(v).replace(/\r?\n/g, "<br>");
}

function toDate(s: string): Date | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function localTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "2026-09-21 19:04" in local time, or "" if unparseable. */
export function localDateTime(s: string): string {
  const d = toDate(s);
  return d ? `${localDate(d)} ${localTime(d)}` : "";
}

const STYLE = `
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; margin: 0; }
  h1 { font-size: 15pt; margin: 0 0 2px 0; }
  .sub { font-size: 9pt; color: #444; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #000; padding: 4px 6px; vertical-align: top; text-align: left; }
  th { background: #eee; font-size: 9pt; }
  .label { font-size: 8pt; text-transform: uppercase; color: #333; display: block; margin-bottom: 2px; }
  .value { min-height: 1.3em; }
  .msg { height: 3.2in; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .foot { font-size: 8pt; color: #555; margin-top: 8px; }
  .gap { height: 8px; }
`;

export function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head>
<body>${body}</body></html>
`;
}

export function field(label: string, value: string, extra = ""): string {
  return `<td${extra}><span class="label">${esc(label)}</span><div class="value">${multiline(value)}</div></td>`;
}

// ------------------------------------------------------------------ ICS 309

export interface Comms309Entry {
  /** When it happened, in milliseconds; formatted per output. */
  at: number;
  from: string;
  to: string;
  message: string;
}

export interface Comms309Input {
  incidentName: string;
  periodFrom: string;
  periodTo: string;
  netName: string;
  operatorName: string;
  operatorCall: string;
  preparedByName: string;
  preparedByPosition: string;
  preparedAt: string;
  entries: Comms309Entry[];
}

/** Just the station's traffic, so the line stays short; blank when it has none. */
function checkinMessage(c: Checkin): string {
  return c.has_traffic ? c.traffic.trim() : "";
}

/**
 * The communications log for a net: each check-in is a station calling in to
 * net control. Oldest first. `netControl` is who the messages are addressed to
 * (the logging operator).
 */
export function comms309Entries(checkins: Checkin[], netControl: string): Comms309Entry[] {
  const out: Comms309Entry[] = [];
  for (const c of checkins) {
    const d = toDate(c.checked_in_at);
    if (!d) continue;
    out.push({
      at: d.getTime(),
      from: c.call_sign.toUpperCase(),
      to: netControl,
      message: checkinMessage(c),
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

function entryTime(e: Comms309Entry, withDate: boolean): string {
  const d = new Date(e.at);
  return withDate ? `${localDate(d)} ${localTime(d)}` : localTime(d);
}

// ------------------------------------------- ICS 309: Winlink "Form-309"
//
// Winlink Express's ICS-309 is its "Form-309" (Standard Forms > ICS USA Forms).
// Everything here follows that form's own template and HTML (Standard Forms
// 1.1.20.0, Form 309 v13.12): 30 log lines per page; per-line limits of 23
// characters for the time, 13 for From and To, 90 for the subject; and these
// header fields — Task # (7), Task Name (50), Date/Time Prepared (YYYY-MM-DD
// HH:mm), Operational Period # (15), Radio Operator Name (35), Station ID (13).

export const FORM309_ROWS = 30;
const FORM309_VERSION = "Form 309 v13.12";

export interface Form309Header {
  /** Agency or group title (the form's "Setup"). */
  title: string;
  task: string;
  taskName: string;
  preparedAt: string;
  opPeriod: string;
  opName: string;
  stationId: string;
}

export interface Form309Row {
  time: string;
  from: string;
  to: string;
  sub: string;
}

/**
 * Winlink messages can go out over radio, so the text sent to Winlink sticks to
 * plain punctuation: dashes, quotes, and ellipses become their ASCII forms.
 * (Letters, including accented ones, are left as they are.)
 */
export function winlinkText(v: string): string {
  return v
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
}

/** Cuts a value to a length the Winlink form will accept, marking a cut with an ellipsis. */
export function clip(v: string, max: number): string {
  const flat = winlinkText(v)
    .replace(/[\t\r\n]+/g, " ")
    .trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 3)}...`;
}

/** Header values cut to the form's field lengths. */
export function form309Header(h: Form309Header): Form309Header {
  return {
    title: h.title.trim(),
    task: clip(h.task, 7),
    taskName: clip(h.taskName, 50),
    preparedAt: clip(h.preparedAt, 18),
    opPeriod: clip(h.opPeriod, 15),
    opName: clip(h.opName, 35),
    stationId: clip(h.stationId, 13),
  };
}

/**
 * Text as a Winlink form's log lines of at most `max` characters, broken at
 * spaces (a word longer than a line is split), so nothing is cut off: an
 * entry too long for one line runs on to the next, as on a paper log. Always
 * at least one line.
 */
export function formLines(v: string, max: number): string[] {
  const flat = winlinkText(v).replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  let cur = "";
  for (let word of flat.split(" ")) {
    while (word.length > max) {
      if (cur) lines.push(cur);
      cur = "";
      lines.push(word.slice(0, max));
      word = word.slice(max);
    }
    if (!word) continue;
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= max) cur += ` ${word}`;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur || lines.length === 0) lines.push(cur);
  return lines;
}

/**
 * Rows split into pages of `size`, an entry's run-on lines (`continues`) kept
 * on the same page as its first where they fit. Always at least one page.
 */
export function formPages<T>(rows: T[], size: number, continues: (row: T) => boolean): T[][] {
  const pages: T[][] = [];
  let page: T[] = [];
  for (let i = 0; i < rows.length; ) {
    let end = i + 1;
    while (end < rows.length && continues(rows[end])) end++;
    const entry = rows.slice(i, end);
    if (page.length > 0 && page.length + entry.length > size && entry.length <= size) {
      pages.push(page);
      page = [];
    }
    for (const row of entry) {
      if (page.length === size) {
        pages.push(page);
        page = [];
      }
      page.push(row);
    }
    i = end;
  }
  if (page.length > 0 || pages.length === 0) pages.push(page);
  return pages;
}

/**
 * Log entries as rows for the Winlink form (date and time always included).
 * A message longer than the form's 90 characters runs on to more rows, with
 * the time, From and To left blank (ICSF-036); `continued` counts the entries
 * that do.
 */
export function form309Rows(entries: Comms309Entry[]): { rows: Form309Row[]; continued: number } {
  let continued = 0;
  const rows = entries.flatMap((e) => {
    const [first, ...more] = formLines(e.message, 90);
    if (more.length > 0) continued++;
    return [
      { time: entryTime(e, true), from: clip(e.from, 13), to: clip(e.to, 13), sub: first },
      ...more.map((sub) => ({ time: "", from: "", to: "", sub })),
    ];
  });
  return { rows, continued };
}

/** Splits rows into form pages of 30, keeping an entry's rows together; there is always at least one page. */
export function form309Pages(rows: Form309Row[]): Form309Row[][] {
  return formPages(rows, FORM309_ROWS, (r) => r.time === "");
}

/**
 * One page in the form's own load/save format: 30 lines of tab-separated
 * time, from, to, subject (blank lines fill the page), then one line of Task #,
 * Task Name, Date/Time Prepared, Operational Period #, Operator Name and
 * Station ID. The form's "Load Form 309 Data" button reads it, its "Paste Data
 * from a Spreadsheet" box takes the same text, and "Save Form 309 Data" writes
 * it. Every line ends with a tab, as the form writes them.
 */
export function form309Data(rows: Form309Row[], header: Form309Header): string {
  const h = form309Header(header);
  const lines: string[] = [];
  for (let i = 0; i < FORM309_ROWS; i++) {
    const r = rows[i];
    lines.push(r ? `${r.time}\t${r.from}\t${r.to}\t${r.sub}\t` : "\t\t\t\t");
  }
  lines.push(
    `${h.task}\t${h.taskName}\t${h.preparedAt}\t${h.opPeriod}\t${h.opName}\t${h.stationId}\t`
  );
  return lines.join("\n") + "\n";
}

/** The message subject and body Winlink builds from Form-309's template. */
export function form309Message(
  rows: Form309Row[],
  header: Form309Header,
  page: number,
  senderCall: string
): { subject: string; body: string } {
  const h = form309Header(header);
  const log = rows
    .map((r) => `TIME: ${r.time}\nSTATION ID:\nFROM: ${r.from}\nTO: ${r.to}\nSUBJECT:\n ${r.sub}`)
    .join("\n\n");
  const body = [
    `${h.title} - Form 309`,
    "",
    `PAGE #: ${page}`,
    "",
    `Task#: ${h.task}`,
    `Task Name: ${h.taskName}`,
    "",
    `Date/Time Prepared: ${h.preparedAt}`,
    `Operational Period #: ${h.opPeriod}`,
    "",
    `Radio Operator Name:${h.opName}`,
    `Station ID: ${h.stationId}`,
    `Express Sender: ${senderCall}`,
    "",
    "         LOG",
    "----------------------------",
    log,
    "",
    "------------------",
    `Senders Template Version: ${FORM309_VERSION}`,
  ].join("\n");
  return {
    subject: winlinkText(`Form 309- ${h.title} - ${h.opName} - ${h.stationId} - ${h.preparedAt}`),
    body: winlinkText(body),
  };
}

/** The exact filename Winlink Express looks for to recognize this as Form-309 data. */
export const FORM309_WINLINK_FILENAME = "RMS_Express_Form_Form-309_Viewer.xml";

/**
 * Winlink form-data XML for one Form-309 page, to attach to a new message so
 * Winlink shows the log. The structure and the "standard" variables follow
 * Winlink's own files and Pat (github.com/la5nta/pat); the field names are the
 * form's own (Title, Page, Task, TaskName, ActivityDateTime1, OpPer, OpName,
 * OperId, Time1..30, From1..30, To1..30, Sub1..30).
 */
export function form309Xml(
  rows: Form309Row[],
  header: Form309Header,
  page: number,
  senderCall: string
): string {
  const h = form309Header(header);
  const vars: [string, string][] = [
    ["Title", h.title],
    ["Page", String(page)],
    ["Task", h.task],
    ["TaskName", h.taskName],
    ["ActivityDateTime1", h.preparedAt],
    ["OpPer", h.opPeriod],
    ["OpName", h.opName],
    ["OperId", h.stationId],
    ["MsgSender", senderCall],
    ["Templateversion", FORM309_VERSION],
  ];
  for (let i = 1; i <= FORM309_ROWS; i++) {
    const r = rows[i - 1];
    vars.push([`Time${i}`, r?.time ?? ""], [`From${i}`, r?.from ?? ""]);
    vars.push([`To${i}`, r?.to ?? ""], [`Sub${i}`, r?.sub ?? ""]);
  }
  return winlinkFormXml("Form-309_Viewer.html", senderCall, vars);
}

/** Whether entries span more than one calendar day (so times need their dates). */
export function spansDays(entries: { at: number }[]): boolean {
  if (entries.length === 0) return false;
  const days = new Set(entries.map((e) => localDate(new Date(e.at))));
  return days.size > 1;
}

export function ics309Html(f: Comms309Input): string {
  const withDate = spansDays(f.entries);
  const rows =
    f.entries.length > 0
      ? f.entries
          .map(
            (e) =>
              `<tr><td>${esc(entryTime(e, withDate))}</td><td>${esc(e.from)}</td><td></td><td>${esc(e.to)}</td><td></td><td>${multiline(e.message)}</td></tr>`
          )
          .join("\n")
      : `<tr><td colspan="6">No communications recorded.</td></tr>`;
  const body = `
<h1>COMMUNICATIONS LOG &nbsp; ICS 309</h1>
<div class="sub">Prepared with Radio Operations Console from the activity's records.</div>
<table>
  <tr>${field("1. Incident Name", f.incidentName, ' style="width:50%"')}${field("2. Operational Period (date/time from – to)", `${f.periodFrom} – ${f.periodTo}`)}</tr>
  <tr>${field("3. Radio Net Name (for NCS) or Position/Tactical Call", f.netName)}${field("4. Radio Operator (name, call sign)", [f.operatorName, f.operatorCall].filter(Boolean).join(", "))}</tr>
</table>
<div class="gap"></div>
<table>
  <thead>
    <tr><th colspan="6">5. Communications Log</th></tr>
    <tr><th style="width:11%">Time</th><th style="width:16%">From (call sign / ID)</th><th style="width:6%">Msg #</th><th style="width:16%">To (call sign / ID)</th><th style="width:6%">Msg #</th><th>Message</th></tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
<div class="gap"></div>
<table>
  <tr>${field("6. Prepared by (name, position/title)", [f.preparedByName, f.preparedByPosition].filter(Boolean).join(", "))}${field("Signature", "")}${field("Date / time prepared", f.preparedAt)}</tr>
</table>
<div class="foot">ICS 309 — Communications Log</div>`;
  return page(`ICS 309 — ${f.incidentName}`, body);
}

// ------------------------------------------------------------------ ICS 213

export interface GeneralMessage213Input {
  incidentName: string;
  toName: string;
  toPosition: string;
  fromName: string;
  fromPosition: string;
  subject: string;
  date: string;
  time: string;
  message: string;
  approvedName: string;
  approvedPosition: string;
}

export function ics213Html(f: GeneralMessage213Input): string {
  const namePos = (n: string, p: string) => [n, p].filter(Boolean).join(" / ");
  const body = `
<h1>GENERAL MESSAGE &nbsp; ICS 213</h1>
<div class="sub">Prepared with Radio Operations Console from the activity's records.</div>
<table>
  <tr>${field("1. Incident Name (optional)", f.incidentName, ' colspan="2"')}</tr>
  <tr>${field("2. To (name / position)", namePos(f.toName, f.toPosition), ' colspan="2"')}</tr>
  <tr>${field("3. From (name / position)", namePos(f.fromName, f.fromPosition), ' colspan="2"')}</tr>
  <tr>${field("4. Subject", f.subject, ' style="width:60%"')}${field("5. Date", f.date)}</tr>
  <tr>${field("6. Time", f.time, ' colspan="2"')}</tr>
  <tr><td colspan="2" class="msg"><span class="label">7. Message</span><div class="value">${multiline(f.message)}</div></td></tr>
  <tr>${field("8. Approved by (name / signature / position/title)", namePos(f.approvedName, f.approvedPosition), ' colspan="2"')}</tr>
  <tr><td colspan="2" style="height:1.4in"><span class="label">9. Reply</span></td></tr>
  <tr>${field("10. Replied by (name / position/title / signature / date/time)", "", ' colspan="2"')}</tr>
</table>
<div class="foot">ICS 213 — General Message</div>`;
  return page(`ICS 213 — ${f.subject || f.incidentName}`, body);
}

function ics213Base(activity: Activity, operatorName: string, when: Date): GeneralMessage213Input {
  return {
    incidentName: activity.title,
    toName: "",
    toPosition: "",
    fromName: operatorName,
    fromPosition: "",
    subject: "",
    date: localDate(when),
    time: localTime(when),
    message: "",
    approvedName: "",
    approvedPosition: "",
  };
}

/** Starting values for an ICS 213 carrying all of an activity's spotter reports. */
export function ics213FromReports(
  activity: Activity,
  reports: SpotterReport[],
  operatorName: string
): GeneralMessage213Input {
  return {
    ...ics213Base(activity, operatorName, new Date()),
    subject: `Spotter reports - ${activity.title} (${reports.length})`,
    message: spotterReportsToText(activity, reports),
  };
}

/** Starting values for an ICS 213 carrying one complete spotter report. */
export function ics213FromReport(
  activity: Activity,
  r: SpotterReport,
  operatorName: string
): GeneralMessage213Input {
  const when = new Date(r.reported_at);
  const d = Number.isNaN(when.getTime()) ? new Date() : when;
  return {
    ...ics213Base(activity, operatorName, d),
    subject: `Spotter report: ${[r.hazard_type, r.magnitude].filter(Boolean).join(" ")}`,
    message: spotterReportsToText(activity, [r]),
  };
}

// ------------------------------------------------- ICS 213: Winlink form data

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** UTC "YYYYMMDDHHMMSS", the format Winlink Express itself writes for submission_datetime. */
function utcSubmissionTimestamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`
  );
}

/** The exact filename Winlink Express looks for to recognize this as ICS-213 form data. */
export const ICS213_WINLINK_FILENAME = "RMS_Express_Form_ICS213_Initial_Viewer.xml";

/** The ICS-213 template version the field names below were checked against (Standard Forms 1.1.20.0). */
const ICS213_VERSION = "ICS 213  v.43.8";

/**
 * Winlink form-data XML: the file Winlink attaches to a message built from an
 * HTML form, which the receiving Winlink Express reads to show the form in its
 * viewer. The structure — RMS_Express_Form, a form_parameters block naming the
 * viewer (`display_form`), and a variables block — and the standard variables
 * added to every form (msgsender, msgto, msgcc, msgsubject, msgbody, msgp2p,
 * msgisreply, msgisforward, msgisacknowledgement, msgseqnum, txtstr) match what
 * Pat (github.com/la5nta/pat), an open-source Winlink client whose output
 * Winlink Express accepts, writes. The operator still addresses and sends the
 * message from Winlink Express; this app has no Winlink transport.
 */
export function winlinkFormXml(
  displayForm: string,
  senderCall: string,
  variables: [string, string][]
): string {
  const standard: [string, string][] = [
    ["msgsender", senderCall],
    ["msgto", ""],
    ["msgcc", ""],
    ["msgsubject", ""],
    ["msgbody", ""],
    ["msgp2p", "False"],
    ["msgisreply", "False"],
    ["msgisforward", "False"],
    ["msgisacknowledgement", "False"],
    ["msgseqnum", "0"],
    ["txtstr", ""],
  ];
  const have = new Set(variables.map(([k]) => k.toLowerCase()));
  const all = [...variables, ...standard.filter(([k]) => !have.has(k))];
  // Winlink Express and Pat write variables in name order, values trimmed.
  all.sort((a, b) => a[0].localeCompare(b[0]));
  const variablesXml = all
    .map(([name, value]) => `        <${name}>${xmlEscape(winlinkText(value).trim())}</${name}>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<RMS_Express_Form>
    <form_parameters>
        <xml_file_version>1.0</xml_file_version>
        <rms_express_version>1.0</rms_express_version>
        <submission_datetime>${utcSubmissionTimestamp(new Date())}</submission_datetime>
        <senders_callsign>${xmlEscape(senderCall)}</senders_callsign>
        <grid_square></grid_square>
        <display_form>${xmlEscape(displayForm)}</display_form>
        <reply_template></reply_template>
    </form_parameters>
    <variables>
${variablesXml}
    </variables>
</RMS_Express_Form>
`;
}

/**
 * Winlink form data for an ICS-213 General Message. The field names are the
 * ICS213 form's own (inc_name, to_name, fm_name, Subjectline, Mdate, Mtime,
 * Message, Approved_Name, Approved_PosTitle); the form has one To and one From
 * field, so name and position are joined with " / ".
 */
export function ics213WinlinkXml(f: GeneralMessage213Input, senderCall: string): string {
  const join = (n: string, p: string) => [n, p].filter(Boolean).join(" / ");
  return winlinkFormXml("ICS213_Initial_Viewer.html", senderCall, [
    ["inc_name", f.incidentName],
    ["to_name", join(f.toName, f.toPosition)],
    ["fm_name", join(f.fromName, f.fromPosition)],
    ["Subjectline", f.subject],
    ["Mdate", f.date],
    ["Mtime", f.time],
    ["Message", f.message],
    ["Approved_Name", f.approvedName],
    ["Approved_PosTitle", f.approvedPosition],
    ["Templateversion", ICS213_VERSION],
    // Optional fields the ICS-213 viewer also reads (exercise marking, GIS position).
    // Left empty, so it never meets an undefined field.
    // The form keeps a copy of the message with tabs turned into "|" (its copydata()).
    ["Message2", f.message.replace(/\t/g, "|")],
    ...["ShowDR", "FormTitle", "IsExercise", "DR_num", "Priority2"].map((k): [string, string] => [
      k,
      "",
    ]),
    ...["mapLat", "mapLon", "MGRS", "locationSource"].map((k): [string, string] => [k, ""]),
  ]);
}

/** The subject and body Winlink builds from the ICS-213 template, for the message that carries the form data. */
export function ics213Message(
  f: GeneralMessage213Input,
  senderCall: string
): { subject: string; body: string } {
  const join = (n: string, p: string) => [n, p].filter(Boolean).join(" / ");
  return {
    subject: winlinkText(`ICS-213: ${f.subject} - ${f.date} ${f.time}`),
    body: winlinkText(
      [
        "GENERAL MESSAGE (ICS 213)",
        "",
        `1. Incident Name: ${f.incidentName}`,
        `2. To (Name and Position): ${join(f.toName, f.toPosition)}`,
        `3. From (Name and Position): ${join(f.fromName, f.fromPosition)}`,
        `4. Subject: ${f.subject}`,
        `5. Date: ${f.date}`,
        `6. Time: ${f.time}`,
        "7. Message:",
        "",
        f.message,
        "",
        `8. Approved by: ${f.approvedName}`,
        `8a. Position/Title: ${f.approvedPosition}`,
        "------------------------------------",
        `Express Sending Station: ${senderCall}`,
        `Senders Template Version: ${ICS213_VERSION}`,
      ].join("\n")
    ),
  };
}
