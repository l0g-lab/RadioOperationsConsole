/**
 * The Activities pane beside the Operations tab (UX-OPS-015): every
 * activity, in sections in the order things happen — open now, each event,
 * coming up, station logs, closed — or found by searching.
 */
import type { Activity } from "./types";
import { activityTypeLabel, isLog, isRelay } from "./activityTypes";
import { pad2, splitScheduledAt } from "./utils";

/** green: open; amber: not started though its time has come; dim: closed, logs, later nets. */
export type StateTone = "open" | "due" | "plain" | "dim";

export interface ActivityRow {
  activity: Activity;
  /** When it ran or is to run ("Mon 10/5 17:46"), or "" for a station log. */
  when: string;
  state: string;
  tone: StateTone;
  /** For a net whose day passed without starting: how long ago ("3 wk ago"), in amber. */
  ago?: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Tue 10/6", with the year when it isn't this year. */
function shortDate(d: Date, now: Date): string {
  const year = d.getFullYear() === now.getFullYear() ? "" : `/${d.getFullYear()}`;
  return `${WEEKDAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}${year}`;
}

/** A stored timestamp as "Mon 10/5 17:46", or "" if unreadable. */
function stamp(iso: string, now: Date): string {
  const d = new Date(iso);
  return iso && !Number.isNaN(d.getTime()) ? `${shortDate(d, now)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : "";
}

/** When it's scheduled, as a local Date (midnight without a time); null if none. */
function scheduledDate(a: Activity): Date | null {
  const { date, time } = splitScheduledAt(a.scheduled_at);
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [h, min] = time ? time.split(":").map(Number) : [0, 0];
  return new Date(+m[1], +m[2] - 1, +m[3], h, min);
}

/** "Tue 10/6 19:00", "Tue 10/6" without a time, or "" unscheduled. */
function scheduledText(a: Activity, now: Date): string {
  const d = scheduledDate(a);
  if (!d) return "";
  const { time } = splitScheduledAt(a.scheduled_at);
  return time ? `${shortDate(d, now)} ${time}` : shortDate(d, now);
}

const DAY_MS = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * A net never started whose day has passed (not today's, which is just due):
 * listed last in Now & coming up, with how long ago, so it can be started,
 * corrected, or deleted without crowding today's nets.
 */
export function isStale(a: Activity, now: Date): boolean {
  if (a.state !== "scheduled" || isLog(a.activity_type)) return false;
  const d = scheduledDate(a);
  return d != null && startOfDay(d) < startOfDay(now);
}

/** "1 day ago", "6 days ago", "3 wk ago", "2 mo ago". */
export function agoText(d: Date, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 60) return `${Math.round(days / 7)} wk ago`;
  return `${Math.round(days / 30)} mo ago`;
}

/** "14 check-ins", "1 contact" (station log), "3 messages" (relay). */
export function recordText(a: Activity): string {
  const n = a.record_count;
  const noun = isRelay(a.activity_type) ? "message" : isLog(a.activity_type) ? "contact" : "check-in";
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** One activity as a row of the table. */
export function activityRow(a: Activity, now: Date): ActivityRow {
  if (isLog(a.activity_type)) {
    return a.state === "closed"
      ? { activity: a, when: "", state: "Closed", tone: "dim" }
      : { activity: a, when: "", state: "Log", tone: "plain" };
  }
  if (a.state === "active") return { activity: a, when: stamp(a.opened_at, now), state: "Open", tone: "open" };
  if (a.state === "closed") {
    return { activity: a, when: stamp(a.opened_at, now) || scheduledText(a, now), state: "Closed", tone: "dim" };
  }
  const due = scheduledDate(a);
  if (due && isStale(a, now)) {
    return { activity: a, when: scheduledText(a, now), state: "Not started", tone: "due", ago: agoText(due, now) };
  }
  return {
    activity: a,
    when: scheduledText(a, now),
    state: "Not started",
    // Amber once its time has come (LIFE-022); a net days away is just listed.
    tone: due && due.getTime() <= now.getTime() ? "due" : "plain",
  };
}

const time = (iso: string) => (iso ? new Date(iso).getTime() || 0 : 0);
const byTitle = (x: Activity, y: Activity) => x.title.localeCompare(y.title, undefined, { sensitivity: "base" });

/**
 * Open (latest started first), then not started (soonest first, unscheduled
 * last), then station logs, then nets whose day passed without starting
 * (most recent first).
 */
function current(acts: Activity[], now: Date): Activity[] {
  const open = acts.filter((a) => a.state === "active" && !isLog(a.activity_type));
  const stale = acts.filter((a) => isStale(a, now));
  const upcoming = acts.filter((a) => a.state === "scheduled" && !isLog(a.activity_type) && !isStale(a, now));
  const logs = acts.filter((a) => isLog(a.activity_type) && a.state !== "closed");
  open.sort((x, y) => time(y.opened_at) - time(x.opened_at));
  upcoming.sort((x, y) => {
    const [dx, dy] = [scheduledDate(x)?.getTime(), scheduledDate(y)?.getTime()];
    if (dx == null || dy == null) return dx == null && dy == null ? byTitle(x, y) : dx == null ? 1 : -1;
    return dx - dy || byTitle(x, y);
  });
  stale.sort((x, y) => (scheduledDate(y)?.getTime() ?? 0) - (scheduledDate(x)?.getTime() ?? 0));
  return [...open, ...upcoming, ...logs.sort(byTitle), ...stale];
}

/** Closed, most recently first (by when it closed, else started, else was scheduled). */
function closed(acts: Activity[]): Activity[] {
  const when = (a: Activity) => time(a.closed_at) || time(a.opened_at) || scheduledDate(a)?.getTime() || 0;
  return acts.filter((a) => a.state === "closed").sort((x, y) => when(y) - when(x));
}

/** When an activity ran or is to run, for ordering an event's activities; null if neither. */
function startMs(a: Activity): number | null {
  return time(a.opened_at) || scheduledDate(a)?.getTime() || null;
}

export interface ActivitySection {
  /** "open", "upcoming", "logs", "closed", or "event:<id>". */
  id: string;
  title: string;
  /** For an event: its day and how it's going ("Mon 10/5 · 1 open · 2 to go · 1 done"). */
  summary: string;
  /** Something in it is open (an event under way), so its heading is green. */
  live: boolean;
  /** Closed, and events that are over, start folded. */
  folded: boolean;
  rows: ActivityRow[];
}

/** An event's day and progress, e.g. "Mon 10/5 · 1 open · 2 to go · 1 done". */
function eventSummary(acts: Activity[], now: Date): string {
  const first = Math.min(...acts.map((a) => startMs(a) ?? Infinity));
  const n = (state: string) => acts.filter((a) => a.state === state).length;
  return [
    Number.isFinite(first) ? shortDate(new Date(first), now) : "",
    n("active") ? `${n("active")} open` : "",
    n("scheduled") ? `${n("scheduled")} to go` : "",
    n("closed") ? `${n("closed")} done` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The Activities pane's sections, in the order things happen (UX-OPS-015):
 * Open now; each event still going, as its own block in running order (one
 * under way first); Coming up (soonest first, unscheduled, then nets whose
 * day passed without starting); Station logs; Closed (most recent
 * first, folded); and events that are over (latest first, folded). An
 * event's activities are only in its block. Empty sections are left out.
 */
export function activitySections(acts: Activity[], now: Date): ActivitySection[] {
  const byEvent = new Map<string, Activity[]>();
  for (const a of acts) {
    if (a.event_id && !isLog(a.activity_type)) byEvent.set(a.event_id, [...(byEvent.get(a.event_id) ?? []), a]);
  }
  const loose = acts.filter((a) => !a.event_id || isLog(a.activity_type));
  const row = (a: Activity) => activityRow(a, now);
  const section = (id: string, title: string, list: Activity[], folded = false): ActivitySection => ({
    id,
    title,
    summary: "",
    live: false,
    folded,
    rows: list.map(row),
  });

  const events = [...byEvent.entries()].map(([id, list]) => {
    const ordered = [...list].sort((x, y) => (startMs(x) ?? Infinity) - (startMs(y) ?? Infinity) || byTitle(x, y));
    const over = list.every((a) => a.state === "closed");
    const live = list.some((a) => a.state === "active");
    return {
      first: Math.min(...list.map((a) => startMs(a) ?? Infinity)),
      over,
      section: {
        id: `event:${id}`,
        title: list[0].event || "Event",
        summary: eventSummary(list, now),
        live,
        folded: over,
        rows: ordered.map(row),
      } as ActivitySection,
    };
  });
  const going = events
    .filter((e) => !e.over)
    .sort((x, y) => Number(y.section.live) - Number(x.section.live) || x.first - y.first);
  const over = events.filter((e) => e.over).sort((x, y) => y.first - x.first);

  const now_ = current(loose, now);
  return [
    section("open", "Open now", now_.filter((a) => a.state === "active" && !isLog(a.activity_type))),
    ...going.map((e) => e.section),
    section("upcoming", "Coming up", now_.filter((a) => a.state === "scheduled" && !isLog(a.activity_type))),
    section("logs", "Station logs", now_.filter((a) => isLog(a.activity_type))),
    section("closed", "Closed", closed(loose), true),
    ...over.map((e) => e.section),
  ].filter((s) => s.rows.length > 0);
}

/**
 * A search through every activity — current ones first, then closed — by
 * title, event, type, or frequency (ignoring case).
 */
export function searchActivities(acts: Activity[], query: string, now: Date): ActivityRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hit = (a: Activity) =>
    [a.title, a.event, activityTypeLabel(a.activity_type), a.frequency].some((v) => v.toLowerCase().includes(q));
  return [...current(acts, now), ...closed(acts)].filter(hit).map((a) => activityRow(a, now));
}
