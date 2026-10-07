import type {
  Activity,
  ActivitySummary,
  Checkin,
  HistoryEntry,
  Ics214Details,
  Ics214Line,
  Ics214Resource,
  RelayMessage,
  SpotterReport,
} from "./types";
import { activityTypeLabel, isRelay } from "./activityTypes";
import { relay214Lines } from "./relay";
import { clip, esc, field, formLines, formPages, localDateTime, multiline, page, winlinkFormXml, winlinkText } from "./icsForms";

/**
 * ICS 214 Activity Log (ics-form-exports.md, ICSF-050–056): what a station did
 * over a period of operation, gathered from every activity in that period —
 * nets opened and closed, their closing notes, traffic handled, spotter
 * reports — plus lines the operator adds by hand. Exported for Winlink's ICS
 * 214 form (Standard Forms 1.1.22.0, template "ICS 214 v 17.10"), checked
 * against the form's own fields, its "Load ICS 214 Data" code, and its viewer,
 * and as a printable page.
 */

/** What one activity contributes: its records, as the app already loads them. */
export interface ActivityRecords {
  activity: Activity;
  summary: ActivitySummary | null;
  checkins: Checkin[];
  history: HistoryEntry[];
  reports: SpotterReport[];
  /** A relay station's messages (relay.ts). */
  relay?: RelayMessage[];
}

const ms = (iso: string) => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * Activities that ran (or were scheduled) during the period: started before
 * it ends and not closed before it starts, or scheduled inside it if never
 * started (ICSF-051).
 */
export function activitiesInPeriod(activities: Activity[], from: string, to: string): Activity[] {
  const a = ms(from);
  const b = ms(to);
  if (a == null || b == null) return [];
  return activities.filter((act) => {
    const opened = ms(act.opened_at);
    if (opened != null) {
      const closed = ms(act.closed_at);
      return opened <= b && (closed == null || closed >= a);
    }
    // Scheduled times are local ("2026-10-03 09:00").
    const scheduled = act.scheduled_at ? ms(act.scheduled_at.replace(" ", "T")) : null;
    return scheduled != null && scheduled >= a && scheduled <= b;
  });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The log lines the records give for the period, each naming the record it
 * came from so a refresh can tell what's new (ICSF-052).
 */
export function generateLines(records: ActivityRecords[], from: string, to: string): Ics214Line[] {
  const a = ms(from);
  const b = ms(to);
  if (a == null || b == null) return [];
  const inPeriod = (iso: string) => {
    const t = ms(iso);
    return t != null && t >= a && t <= b;
  };
  const lines: Ics214Line[] = [];
  const add = (at: string, text: string, source: string) => {
    if (inPeriod(at)) lines.push({ at: new Date(at).toISOString(), text, source });
  };

  for (const { activity: act, summary, checkins, history, reports, relay = [] } of records) {
    const on = act.frequency ? ` on ${act.frequency}` : "";
    add(act.opened_at, `Opened ${act.title} (${activityTypeLabel(act.activity_type)})${on}`, `start:${act.id}`);

    if (act.closed_at) {
      const counts = !summary
        ? ""
        : isRelay(act.activity_type)
          ? `: ${plural(summary.relay_messages, "message", "messages")} relayed${
              summary.unpassed_relay_messages > 0 ? `, ${summary.unpassed_relay_messages} not passed` : ""
            }${summary.held_relay_messages > 0 ? `, ${summary.held_relay_messages} still held` : ""}`
          : `: ${plural(summary.checkins, "check-in", "check-ins")} (${plural(
            summary.unique_stations,
            "station",
            "stations"
          )})${summary.traffic_items > 0 ? `, ${plural(summary.traffic_items, "with traffic", "with traffic")}` : ""}`;
      add(act.closed_at, `Closed ${act.title}${counts}`, `end:${act.id}`);
      const notes = (summary?.conclusion ?? act.conclusion).trim();
      if (notes) add(act.closed_at, `${act.title} closing notes: ${notes}`, `notes:${act.id}`);
    }

    // Traffic marked handled (the most recent mark for each check-in).
    const byId = new Map(checkins.map((c) => [c.id, c]));
    const handled = new Map<string, string>();
    for (const e of history) {
      if (e.entity_type !== "checkin" || e.action !== "traffic_handled") continue;
      let on = false;
      try {
        on = Boolean(JSON.parse(e.data)?.handled);
      } catch {
        on = false;
      }
      if (on) handled.set(e.entity_id, e.created_at);
      else handled.delete(e.entity_id);
    }
    for (const [id, at] of handled) {
      const c = byId.get(id);
      if (!c) continue; // removed since
      const what = c.traffic ? `: ${c.traffic}` : "";
      add(at, `Handled traffic from ${c.call_sign}${what}`, `traffic:${id}`);
    }

    lines.push(...relay214Lines(relay, from, to));

    for (const r of reports) {
      const hazard = [r.hazard_type, r.magnitude].filter(Boolean).join(" ");
      const where = r.location_text || r.county;
      const who = r.reporter ? ` from ${r.reporter}` : "";
      add(r.reported_at, `Spotter report${who}: ${hazard}${where ? `, ${where}` : ""}`, `report:${r.id}`);
    }
  }
  return sortLines(lines);
}

/** In time order; lines at the same time keep their order. */
export function sortLines(lines: Ics214Line[]): Ics214Line[] {
  return lines
    .map((l, i) => ({ l, i, t: ms(l.at) ?? 0 }))
    .sort((x, y) => x.t - y.t || x.i - y.i)
    .map((x) => x.l);
}

/**
 * Adds what the records now give that the log doesn't have yet, leaving the
 * operator's lines — added, changed, or deleted — as they are (ICSF-053).
 * Returns the merged lines and how many were added.
 */
export function mergeLines(
  saved: Ics214Line[],
  dismissed: string[],
  generated: Ics214Line[]
): { lines: Ics214Line[]; added: number } {
  const have = new Set(saved.map((l) => l.source).filter(Boolean) as string[]);
  const gone = new Set(dismissed);
  const fresh = generated.filter((g) => g.source && !have.has(g.source) && !gone.has(g.source));
  return { lines: sortLines([...saved, ...fresh]), added: fresh.length };
}

/** The operators recorded on anything in the period, as resource rows (ICSF-054). */
export function resourcesFromRecords(records: ActivityRecords[], from: string, to: string): Ics214Resource[] {
  const a = ms(from);
  const b = ms(to);
  const names = new Set<string>();
  for (const { history } of records) {
    for (const e of history) {
      const t = ms(e.created_at);
      if (e.operator && t != null && a != null && b != null && t >= a && t <= b) names.add(e.operator);
    }
  }
  return [...names].sort().slice(0, ICS214_RESOURCE_ROWS).map((name) => ({ name, position: "", agency: "" }));
}

// ------------------------------------------------------------ Winlink form

/** The form's rows: 8 resources, 24 log lines a page. */
export const ICS214_RESOURCE_ROWS = 8;
export const ICS214_LOG_ROWS = 24;
/** The template version the fields below were checked against (Standard Forms 1.1.22.0). */
const ICS214_VERSION = "ICS 214 v 17.10";
/** The exact filename Winlink Express looks for to recognize ICS 214 form data. */
export const ICS214_WINLINK_FILENAME = "RMS_Express_Form_ICS214_Viewer.xml";

/** The form's field lengths (its maxlength attributes). */
const LIMITS = {
  Incident_Name: 55,
  Page: 2,
  DateTimeFrom: 22,
  DateTimeTo: 22,
  Name: 40,
  ICS_Position: 40,
  Home_Agency: 50,
  ResName: 30,
  ResPosition: 35,
  ResAgency: 50,
  ActivityDateTime: 20,
  Activities: 100,
  PreparedName: 35,
};

/** One page of the form, as its fields, cut to their lengths. */
export interface Form214Page {
  fields: [string, string][];
  /** Log entries on this page too long for one 100-character line, run on to the next (ICSF-057). */
  continued: number;
}

/**
 * The log as pages of the Winlink form, 24 lines each; always at least one
 * page (ICSF-055). An entry longer than a line runs on to the next with the
 * date/time left blank, kept on one page where it fits.
 */
export function form214Pages(d: Ics214Details): Form214Page[] {
  const header: [string, string][] = [
    ["Incident_Name", clip(d.incident_name, LIMITS.Incident_Name)],
    ["DateTimeFrom", clip(localDateTime(d.period_from), LIMITS.DateTimeFrom)],
    ["DateTimeTo", clip(localDateTime(d.period_to), LIMITS.DateTimeTo)],
    ["Name", clip(d.name, LIMITS.Name)],
    ["ICS_Position", clip(d.ics_position, LIMITS.ICS_Position)],
    ["Home_Agency", clip(d.home_agency, LIMITS.Home_Agency)],
  ];
  for (let i = 0; i < ICS214_RESOURCE_ROWS; i++) {
    const r = d.resources[i];
    header.push([`Name${i + 1}`, clip(r?.name ?? "", LIMITS.ResName)]);
    header.push([`ICS_Position${i + 1}`, clip(r?.position ?? "", LIMITS.ResPosition)]);
    header.push([`Home_Agency${i + 1}`, clip(r?.agency ?? "", LIMITS.ResAgency)]);
  }
  header.push(["PreparedName", clip(d.prepared_name, LIMITS.PreparedName)]);

  // Each entry as one or more form lines; a run-on line has no date/time.
  const rows = sortLines(d.lines).flatMap((l) =>
    formLines(l.text, LIMITS.Activities).map((text, i) => ({
      at: i === 0 ? clip(localDateTime(l.at), LIMITS.ActivityDateTime) : "",
      text,
      runsOn: i === 1,
    }))
  );
  return formPages(rows, ICS214_LOG_ROWS, (r) => r.at === "").map((page, n) => {
    const fields: [string, string][] = [...header, ["Page", String(n + 1)]];
    for (let i = 0; i < ICS214_LOG_ROWS; i++) {
      fields.push([`ActivityDateTime${i + 1}`, page[i]?.at ?? ""]);
      fields.push([`Activities${i + 1}`, page[i]?.text ?? ""]);
    }
    return { fields, continued: page.filter((r) => r.runsOn).length };
  });
}

/**
 * The file the form's "Load ICS 214 Data" button reads: its fields as JSON,
 * the same shape its save writes. Only the form's own field names, since the
 * form stops at a name it doesn't have.
 */
export function form214LoadFile(p: Form214Page): string {
  return JSON.stringify(Object.fromEntries(p.fields), null, 2) + "\n";
}

/**
 * A page's log lines as the form's "Paste Data" box takes them: one line per
 * entry, date/time and activity separated by a tab.
 */
export function form214PasteLines(p: Form214Page): string {
  const f = Object.fromEntries(p.fields);
  return Array.from({ length: ICS214_LOG_ROWS }, (_, i) => i + 1)
    .filter((i) => f[`ActivityDateTime${i}`] || f[`Activities${i}`])
    .map((i) => `${f[`ActivityDateTime${i}`]}\t${f[`Activities${i}`]}`)
    .join("\n");
}

/** Winlink form data for a page, for the message's attachment. */
export function form214Xml(p: Form214Page, senderCall: string): string {
  return winlinkFormXml("ICS214_Viewer.html", senderCall, [
    ...p.fields,
    ["FormTitle", ""],
    ["Templateversion", ICS214_VERSION],
  ]);
}

/** The message subject and body Winlink builds from the ICS 214 template. */
export function form214Message(p: Form214Page, senderCall: string): { subject: string; body: string } {
  const f = Object.fromEntries(p.fields);
  const rows = (n: number, line: (i: number) => string) =>
    Array.from({ length: n }, (_, i) => line(i + 1)).join("\n");
  return {
    subject: winlinkText(`214- ${f.Incident_Name} - ${f.Name}-${f.DateTimeFrom} - ${f.DateTimeTo}`),
    body: winlinkText(
      [
        "ICS214 ",
        ` \\`,
        `PAGE # ${f.Page}`,
        "",
        `1. Incident or Event Name:\t${f.Incident_Name}`,
        "2. Operational Period: ",
        ` From:\t${f.DateTimeFrom} `,
        ` To:\t${f.DateTimeTo}`,
        "",
        `3: Name:\t${f.Name}`,
        `4: ICS Position:\t${f.ICS_Position}`,
        `5  Home Agency & Unit:\t${f.Home_Agency}`,
        "----------------------------------------------",
        "6. RESOURCES ASSIGNED:",
        "",
        "NAME\tICS POSITION\tHOME AGENCY",
        rows(ICS214_RESOURCE_ROWS, (i) => `${f[`Name${i}`]}\t${f[`ICS_Position${i}`]}\t${f[`Home_Agency${i}`]}`),
        "",
        "----------------------------------------------",
        "7.ACTIVITY LOG OF NOTABLE EVENTS:",
        "",
        "DATE & TIME\tACTIVITY",
        // Winlink's own template shows line 23's time on line 24; this shows each line's own.
        rows(ICS214_LOG_ROWS, (i) => `${f[`ActivityDateTime${i}`]}\t${f[`Activities${i}`]}`),
        "",
        "---------------------------------------------",
        `4. PREPARED BY:\t${f.PreparedName}`,
        "---------------------------------------------",
        "",
        `Express Sending Station:\t${senderCall}`,
        `Senders Template Version:\t${ICS214_VERSION}`,
      ].join("\n")
    ),
  };
}

// ------------------------------------------------------------ printable

/** The whole log as a printable page (all lines, not split into form pages). */
export function ics214Html(d: Ics214Details): string {
  const resources =
    d.resources.length > 0
      ? d.resources
          .map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.position)}</td><td>${esc(r.agency)}</td></tr>`)
          .join("\n")
      : `<tr><td colspan="3">None listed.</td></tr>`;
  const lines = sortLines(d.lines);
  const log =
    lines.length > 0
      ? lines
          .map((l) => `<tr><td>${esc(localDateTime(l.at))}</td><td>${multiline(l.text)}</td></tr>`)
          .join("\n")
      : `<tr><td colspan="2">No activity recorded.</td></tr>`;
  const body = `
<h1>ACTIVITY LOG &nbsp; ICS 214</h1>
<div class="sub">Prepared with Radio Operations Console from the records and the operator's notes.</div>
<table>
  <tr>${field("1. Incident Name", d.incident_name, ' style="width:50%"')}${field(
    "2. Operational Period (date/time from – to)",
    `${localDateTime(d.period_from)} – ${localDateTime(d.period_to)}`
  )}</tr>
</table>
<table>
  <tr>${field("3. Name", d.name, ' style="width:34%"')}${field("4. ICS Position", d.ics_position, ' style="width:33%"')}${field(
    "5. Home Agency (and Unit)",
    d.home_agency
  )}</tr>
</table>
<div class="gap"></div>
<table>
  <thead>
    <tr><th colspan="3">6. Resources Assigned</th></tr>
    <tr><th style="width:34%">Name</th><th style="width:33%">ICS Position</th><th>Home Agency (and Unit)</th></tr>
  </thead>
  <tbody>
${resources}
  </tbody>
</table>
<div class="gap"></div>
<table>
  <thead>
    <tr><th colspan="2">7. Activity Log</th></tr>
    <tr><th style="width:20%">Date/Time</th><th>Notable Activities</th></tr>
  </thead>
  <tbody>
${log}
  </tbody>
</table>
<div class="gap"></div>
<table>
  <tr>${field("8. Prepared by (name, position/title)", [d.prepared_name, d.ics_position].filter(Boolean).join(", "))}${field(
    "Signature",
    ""
  )}${field("Date/Time", localDateTime(new Date().toISOString()))}</tr>
</table>
<div class="foot">ICS 214 — Activity Log</div>`;
  return page(`ICS 214 — ${d.incident_name}`, body);
}
