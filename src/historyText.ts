/**
 * The History tab in words (AUDIT-020): each recorded event as a sentence —
 * "Ended Tuesday Net", "Marked W4ABC's traffic handled", "Edited GMRS net:
 * title “GMRS” → “GMRS net”" — rather than its stored codes and data.
 */
import type { HistoryEntry } from "./types";
import { activityTypeLabel } from "./activityTypes";
import { pad2 } from "./utils";

/** A sentence's pieces: plain text, or a name to show in bold. */
export type Seg = string | { name: string };

type Json = Record<string, unknown>;

function parse(data: string): Json {
  try {
    const v = JSON.parse(data);
    return v && typeof v === "object" ? (v as Json) : {};
  } catch {
    return {};
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** What fields are called in a sentence; anything else is left out of "what changed". */
const FIELD_NAMES: Record<string, string> = {
  title: "title",
  name: "name",
  display_name: "name",
  call_sign: "call sign",
  activity_type: "type",
  scheduled_at: "date",
  frequency: "frequency",
  opened_at: "start",
  closed_at: "end",
  qth_location: "location",
  address: "address",
  grid_square: "grid",
  location_text: "location",
  location_label: "location",
  location_lat: "map position",
  lat: "map position",
  county: "county",
  traffic: "traffic",
  has_traffic: "traffic",
  reporter: "reporter",
  hazard_type: "hazard",
  magnitude: "magnitude",
  source: "source",
  reported_at: "time",
  notes: "notes",
  from_station: "from",
  for_station: "for",
  received_via: "via",
  received_at: "time",
  message: "message",
  output_mhz: "output",
  offset_mhz: "offset",
  tone_in: "tone",
  tone_out: "output tone",
  mode: "mode",
  checkin_info: "check-in instructions",
  run_by: "run by",
  schedule_kind: "schedule",
  weekdays: "days",
  weeks: "weeks",
  start_time: "start time",
  end_time: "end time",
  repeater_id: "repeater",
  date: "date",
  at: "time",
  rst_sent: "RST sent",
  rst_received: "RST received",
  power: "power",
  antenna: "antenna",
  station_kind: "station type",
  cross_street: "cross street",
};

/** Values worth showing: short, and in words (a time as 19:02, a type by its name). */
function shown(field: string, v: unknown): string | null {
  if (v == null || v === "") return "none";
  if (field === "activity_type") return activityTypeLabel(str(v));
  if ((field === "opened_at" || field === "closed_at") && typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  if (typeof v === "object") return null;
  const s = str(v);
  return s.length > 32 ? null : s;
}

/** The changed fields between before and after (nested ones too), in words. */
export function changes(before: unknown, after: unknown): string {
  const flat = (o: unknown, out: Json = {}): Json => {
    if (o && typeof o === "object" && !Array.isArray(o)) {
      for (const [k, v] of Object.entries(o as Json)) {
        if (v && typeof v === "object" && !Array.isArray(v)) flat(v, out);
        else out[k] = v;
      }
    }
    return out;
  };
  const [b, a] = [flat(before), flat(after)];
  const same = (x: unknown, y: unknown) => (x ?? "") === (y ?? "") || JSON.stringify(x ?? "") === JSON.stringify(y ?? "");
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const k of Object.keys({ ...b, ...a })) {
    const label = FIELD_NAMES[k];
    if (!label || seen.has(label) || same(b[k], a[k])) continue;
    seen.add(label);
    const [from, to] = [shown(k, b[k]), shown(k, a[k])];
    parts.push(from != null && to != null && !(k === "location_lat" || k === "lat") ? `${label} “${from}” → “${to}”` : label);
  }
  if (parts.length === 0) return "";
  return parts.length > 3 ? `${parts.slice(0, 3).join(", ")} and ${parts.length - 3} more` : parts.join(", ");
}

/** "relays", or a deleted one's name from its own data, or a generic word. */
function subjectOf(e: HistoryEntry, d: Json, fallback: string): Seg {
  const name = e.subject || str(d.name) || str(d.title) || str((d.after as Json | undefined)?.name) || str((d.after as Json | undefined)?.title);
  return name ? { name } : fallback;
}

const KIND_NOUN: Record<string, string> = {
  repeater: "repeater",
  net_listing: "net listing",
  place: "place",
  event: "event",
  ics214_log: "ICS 214 log",
  operator: "operator",
};

/** Ends an edit's sentence with what changed, if it can be said. */
const edited = (lead: Seg[], d: Json): Seg[] => {
  const what = changes(d.before, d.after);
  return what ? [...lead, `: ${what}`] : lead;
};

/**
 * One event as a sentence. `operatorName` names an operator by id, for a
 * change of who runs a net (the event stores only ids).
 */
export function describeHistory(e: HistoryEntry, operatorName: (id: string) => string | null = () => null): Seg[] {
  const d = parse(e.data);
  const reason = str(d.reason).trim();
  const because = reason ? ` — “${reason}”` : "";
  const who = (id: unknown) => operatorName(str(id)) ?? "another operator";

  switch (e.entity_type) {
    case "activity": {
      const net = subjectOf(e, d, "an activity");
      switch (e.action) {
        case "started":
          return ["Started ", net];
        case "closed":
          return ["Ended ", net];
        case "reopened":
          return ["Reopened ", net, because];
        case "correct":
          return edited(["Edited ", net], d);
        case "correct_times":
          return edited(["Corrected the times of ", net], d);
        case "change_operator":
          return ["Changed who runs ", net, ` from ${who(d.from)} to ${who(d.to)}`];
        case "set_event": {
          const [before, after] = [str(d.before), str(d.after)];
          if (after) return ["Put ", net, " in the event ", { name: after }];
          return ["Took ", net, " out of the event", before ? " " : "", ...(before ? [{ name: before }] : [])];
        }
        case "delete_permanently": {
          const counts = [
            [d.checkins, "check-in"],
            [d.spotter_reports, "spotter report"],
            [d.relay_messages, "relay message"],
          ]
            .filter(([n]) => Number(n) > 0)
            .map(([n, w]) => `${n} ${w}${Number(n) === 1 ? "" : "s"}`);
          return ["Deleted ", net, counts.length ? ` and its ${counts.join(", ")}` : ""];
        }
        case "alert_attached":
          return ["Attached the ", { name: str(d.event) || "NWS alert" }, " to ", net];
        case "alert_removed":
          return ["Took the ", { name: str(d.event) || "NWS alert" }, " off ", net];
        case "activity_entry":
          return ["Noted in ", net, e.data && !e.data.startsWith("{") ? `: ${e.data}` : ""];
      }
      break;
    }
    case "checkin": {
      const call = subjectOf(e, d, "a station");
      switch (e.action) {
        case "correct":
          return edited(["Edited ", call, "'s check-in"], d);
        case "void":
          return ["Removed ", call, "'s check-in", because];
        case "restore":
          return ["Restored ", call, "'s check-in"];
        case "traffic_handled":
          return d.handled === false ? ["Marked ", call, "'s traffic not handled"] : ["Marked ", call, "'s traffic handled"];
        case "create_report_from_checkin":
          return ["Started a spotter report from ", call, "'s check-in"];
      }
      break;
    }
    case "spotter_report": {
      const report = subjectOf(e, d, "a spotter report");
      switch (e.action) {
        case "correct":
          return edited(["Edited the spotter report ", report], d);
        case "void":
          return ["Removed the spotter report ", report, because];
        case "restore":
          return ["Restored the spotter report ", report];
      }
      break;
    }
    case "relay_message": {
      const msg = e.subject
        ? { name: e.subject }
        : d.from_station
          ? { name: `${str(d.from_station)} for ${str(d.for_station)}` }
          : "a message";
      const via = str(d.via) ? ` via ${str(d.via)}` : "";
      const note = str(d.note).trim() ? ` — “${str(d.note).trim()}”` : "";
      switch (e.action) {
        case "create":
          return ["Logged the message ", msg, str(d.received_via) ? ` received via ${str(d.received_via)}` : ""];
        case "correct":
          return edited(["Edited the message ", msg], d);
        case "relay_passed":
          return ["Passed the message ", msg, ` to ${str(d.station)}${via}`];
        case "relay_attempt":
          return ["Tried to pass the message ", msg, `${str(d.station) ? ` to ${str(d.station)}` : ""}${via}`, note];
        case "relay_not_passed":
          return ["Couldn't pass the message ", msg, note];
        case "relay_undo":
          return ["Undid a step on the message ", msg];
        case "void":
          return ["Removed the message ", msg, because];
        case "restore":
          return ["Restored the message ", msg];
      }
      break;
    }
    default: {
      const noun = KIND_NOUN[e.entity_type];
      if (!noun) break;
      const thing = subjectOf(e, d, `a ${noun}`);
      switch (e.action) {
        case "create":
          return [`Added the ${noun} `, thing];
        case "correct":
          return edited([`Edited the ${noun} `, thing], d);
        case "delete":
          return [`Deleted the ${noun} `, thing];
        case "retire":
          return [`Retired the ${noun} `, thing];
        case "restore":
          return [`Restored the ${noun} `, thing];
      }
    }
  }
  // Anything not described above, in plain words rather than codes.
  return [`${e.action.replace(/_/g, " ")} (${e.entity_type.replace(/_/g, " ")})`, e.subject ? " " : "", ...(e.subject ? [{ name: e.subject }] : [])];
}

/** The kind of thing an event is about, for its icon. */
export function historyKind(e: HistoryEntry): "net" | "station" | "report" | "message" | "directory" | "event" | "operator" {
  switch (e.entity_type) {
    case "activity":
      return "net";
    case "checkin":
      return "station";
    case "spotter_report":
      return "report";
    case "relay_message":
      return "message";
    case "event":
    case "ics214_log":
      return "event";
    case "operator":
      return "operator";
    default:
      return "directory";
  }
}

/** The sentence as plain text, for searching. */
export function historyPlain(segs: Seg[]): string {
  return segs.map((s) => (typeof s === "string" ? s : s.name)).join("");
}
