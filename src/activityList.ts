/**
 * The Activities table on the Operations tab (UX-OPS-015): every activity,
 * one line each, viewed as what's current (open, not started, station logs),
 * what's closed, or all; or found by searching.
 */
import type { Activity } from "./types";
import { activityTypeLabel, isLog } from "./activityTypes";
import { pad2, splitScheduledAt } from "./utils";

export type ActivityView = "current" | "closed" | "all";

/** green: open; amber: not started though its time has come; dim: closed, logs, later nets. */
export type StateTone = "open" | "due" | "plain" | "dim";

export interface ActivityRow {
  activity: Activity;
  /** When it ran or is to run ("Mon 10/5 17:46"), or "" for a station log. */
  when: string;
  state: string;
  tone: StateTone;
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

/** Open (latest started first), then not started (soonest first, unscheduled last), then station logs. */
function current(acts: Activity[]): Activity[] {
  const open = acts.filter((a) => a.state === "active" && !isLog(a.activity_type));
  const upcoming = acts.filter((a) => a.state === "scheduled" && !isLog(a.activity_type));
  const logs = acts.filter((a) => isLog(a.activity_type) && a.state !== "closed");
  open.sort((x, y) => time(y.opened_at) - time(x.opened_at));
  upcoming.sort((x, y) => {
    const [dx, dy] = [scheduledDate(x)?.getTime(), scheduledDate(y)?.getTime()];
    if (dx == null || dy == null) return dx == null && dy == null ? byTitle(x, y) : dx == null ? 1 : -1;
    return dx - dy || byTitle(x, y);
  });
  return [...open, ...upcoming, ...logs.sort(byTitle)];
}

/** Closed, most recently first (by when it closed, else started, else was scheduled). */
function closed(acts: Activity[]): Activity[] {
  const when = (a: Activity) => time(a.closed_at) || time(a.opened_at) || scheduledDate(a)?.getTime() || 0;
  return acts.filter((a) => a.state === "closed").sort((x, y) => when(y) - when(x));
}

/** How many each view holds, for its chip. */
export function viewCounts(acts: Activity[]): Record<ActivityView, number> {
  const c = current(acts).length;
  const d = closed(acts).length;
  return { current: c, closed: d, all: c + d };
}

/**
 * The rows to show. A search looks through everything, whatever the view, by
 * title, event, type, or frequency (ignoring case).
 */
export function activityRows(acts: Activity[], view: ActivityView, query: string, now: Date): ActivityRow[] {
  const q = query.trim().toLowerCase();
  if (q) {
    const hit = (a: Activity) =>
      [a.title, a.event, activityTypeLabel(a.activity_type), a.frequency].some((v) => v.toLowerCase().includes(q));
    return [...current(acts), ...closed(acts)].filter(hit).map((a) => activityRow(a, now));
  }
  const list = view === "current" ? current(acts) : view === "closed" ? closed(acts) : [...current(acts), ...closed(acts)];
  return list.map((a) => activityRow(a, now));
}
