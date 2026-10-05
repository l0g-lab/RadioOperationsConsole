/**
 * Events (docs/features/events.md): activities sharing an event name, such as
 * the nets and relays of one exercise.
 */
import type { Activity } from "./types";

/** How close to its time the next activity has to be to offer starting it. */
export const START_NEXT_WINDOW_MS = 15 * 60_000;

/** When an activity is scheduled, in milliseconds; null if it has no date. */
export function scheduledMs(a: Activity): number | null {
  const v = a.scheduled_at.trim();
  if (!v) return null;
  const t = new Date(v.replace(" ", "T")).getTime();
  return Number.isNaN(t) ? null : t;
}

/** When an activity started, else when it's scheduled, in milliseconds; null if neither. */
export function startMs(a: Activity): number | null {
  const opened = a.opened_at ? new Date(a.opened_at).getTime() : NaN;
  return Number.isNaN(opened) ? scheduledMs(a) : opened;
}

/**
 * An event's span: from its first activity's start to its last one's end, or
 * now while any is still to come or running. Null when none has a time.
 */
export function eventSpan(activities: Activity[], now = Date.now()): { from: string; to: string } | null {
  const starts = activities.map(startMs).filter((t): t is number => t != null);
  if (starts.length === 0) return null;
  const from = Math.min(...starts);
  const ends = activities.map((a) => new Date(a.closed_at).getTime()).filter((t) => !Number.isNaN(t));
  const done = activities.every((a) => a.state === "closed");
  const minute = Math.ceil(now / 60_000) * 60_000;
  const to = done && ends.length ? Math.max(...ends) : Math.max(minute, ...starts);
  return { from: new Date(from).toISOString(), to: new Date(Math.max(to, from + 60_000)).toISOString() };
}

/** Where an event is: nothing in it yet, still to come, under way, or over. */
export function eventStatus(activities: Activity[]): "empty" | "upcoming" | "on" | "finished" {
  if (activities.length === 0) return "empty";
  if (activities.every((a) => a.state === "closed")) return "finished";
  if (activities.some((a) => a.state !== "scheduled")) return "on";
  return "upcoming";
}

export interface NextInEvent {
  activity: Activity;
  /** When it's scheduled, or null if it has no time. */
  at: number | null;
  /** Due within the window (or overdue), so starting it now makes sense. */
  due: boolean;
}

/**
 * The next activity in the same event that hasn't started: the soonest
 * scheduled, then any without a time. Null when there is none, or the
 * activity isn't in an event.
 */
export function nextInEvent(activities: Activity[], current: Activity, now = Date.now()): NextInEvent | null {
  if (!current.event_id) return null;
  const waiting = activities
    .filter((a) => a.event_id === current.event_id && a.id !== current.id && a.state === "scheduled")
    .map((a) => ({ activity: a, at: scheduledMs(a) }))
    .sort((x, y) => (x.at ?? Infinity) - (y.at ?? Infinity) || x.activity.title.localeCompare(y.activity.title));
  const next = waiting[0];
  if (!next) return null;
  return { ...next, due: next.at != null && next.at - now <= START_NEXT_WINDOW_MS };
}

/** "in 55 min", "in 2 h 5 min", "now", or "12 min ago". */
export function relativeTime(at: number, now = Date.now()): string {
  const min = Math.round((at - now) / 60_000);
  if (min === 0) return "now";
  const span = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
  return min > 0 ? `in ${span(min)}` : `${span(-min)} ago`;
}
