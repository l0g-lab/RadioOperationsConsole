import type { NetListing, NetListingDetails } from "./types";
import { pad2 } from "./utils";

/**
 * When listed nets meet (docs/features/net-listings.md), worked out from
 * their schedules in this computer's local time. Nothing is stored per
 * meeting (NETL-023).
 */

/** One meeting of a net. */
export interface Meeting {
  start: Date;
  end: Date;
  /** Started and not yet over. */
  underway: boolean;
}

/** How long a net with no end time counts as under way (NETL-020). */
const ASSUMED_MINUTES = 60;
/** Far enough ahead to reach any monthly meeting. */
const LOOKAHEAD_DAYS = 62;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEK_NAMES: Record<string, string> = { "1": "1st", "2": "2nd", "3": "3rd", "4": "4th", last: "last" };

export const WEEKDAY_OPTIONS = DAY_SHORT.map((label, value) => ({ value, label }));
export const WEEK_OPTIONS = ["1", "2", "3", "4", "last"].map((value) => ({
  value,
  label: WEEK_NAMES[value],
}));

/** `day` at the local time "HH:MM". */
function at(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
}

function isLastWeek(day: Date): boolean {
  const daysInMonth = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  return day.getDate() + 7 > daysInMonth;
}

/** Whether the net meets on this calendar day (NETL-003). */
export function meetsOn(l: NetListingDetails, day: Date): boolean {
  if (l.schedule_kind === "as_needed" || !l.weekdays.includes(day.getDay())) return false;
  if (l.schedule_kind === "weekly") return true;
  const week = Math.ceil(day.getDate() / 7);
  return l.weeks.some((w) => (w === "last" ? isLastWeek(day) : Number(w) === week));
}

/**
 * The meeting under way now, else the next one; null for "as needed" (or a
 * schedule with no time).
 */
export function nextMeeting(l: NetListingDetails, now: Date): Meeting | null {
  if (l.schedule_kind === "as_needed" || !/^\d\d:\d\d$/.test(l.start_time)) return null;
  for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (!meetsOn(l, day)) continue;
    const start = at(day, l.start_time);
    const end = l.end_time
      ? at(day, l.end_time)
      : new Date(start.getTime() + ASSUMED_MINUTES * 60_000);
    if (end <= now) continue;
    return { start, end, underway: start <= now };
  }
  return null;
}

/** One net meeting on a given day. */
export interface DayEntry {
  listing: NetListing;
  meeting: Meeting;
}

/** One day of the week ahead, with its nets in time order. */
export interface ScheduleDay {
  date: Date;
  /** "Today · Fri Oct 2", "Tomorrow · Sat Oct 3", "Sun Oct 4". */
  label: string;
  entries: DayEntry[];
}

export interface WeekAhead {
  days: ScheduleDay[];
  /** Scheduled nets that don't meet in those days (most monthly ones), by next meeting. */
  later: DayEntry[];
  /** "As needed" nets, by name. */
  asNeeded: NetListing[];
}

const byName = (a: NetListing, b: NetListing) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/**
 * The nets of the coming days, one entry per day, each day's nets by start
 * time; a net that meets on several days is listed under each. Today leaves
 * out nets already over (NETL-020).
 */
export function weekAhead(listings: NetListing[], now: Date, dayCount = 7): WeekAhead {
  const days: ScheduleDay[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < dayCount; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const entries: DayEntry[] = [];
    for (const listing of listings) {
      if (!/^\d\d:\d\d$/.test(listing.start_time) || !meetsOn(listing, date)) continue;
      const start = at(date, listing.start_time);
      const end = listing.end_time
        ? at(date, listing.end_time)
        : new Date(start.getTime() + ASSUMED_MINUTES * 60_000);
      if (end <= now) continue;
      entries.push({ listing, meeting: { start, end, underway: start <= now } });
      seen.add(listing.id);
    }
    entries.sort(
      (a, b) => a.meeting.start.getTime() - b.meeting.start.getTime() || byName(a.listing, b.listing)
    );
    const name = `${DAY_SHORT[date.getDay()]} ${MONTH_SHORT[date.getMonth()]} ${date.getDate()}`;
    days.push({ date, label: i === 0 ? `Today · ${name}` : i === 1 ? `Tomorrow · ${name}` : name, entries });
  }
  const later: DayEntry[] = [];
  for (const listing of listings) {
    if (seen.has(listing.id)) continue;
    const meeting = nextMeeting(listing, now);
    if (meeting) later.push({ listing, meeting });
  }
  later.sort((a, b) => a.meeting.start.getTime() - b.meeting.start.getTime());
  const asNeeded = listings.filter((l) => l.schedule_kind === "as_needed").sort(byName);
  return { days, later, asNeeded };
}

function hhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "Under way until 19:30", "Today 19:00", "Tomorrow 20:30", "Thu Oct 8, 20:00" (NETL-021). */
export function describeNext(m: Meeting, now: Date): string {
  if (m.underway) return `Under way until ${hhmm(m.end)}`;
  const days = Math.round(
    (new Date(m.start.getFullYear(), m.start.getMonth(), m.start.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000
  );
  if (days === 0) return `Today ${hhmm(m.start)}`;
  if (days === 1) return `Tomorrow ${hhmm(m.start)}`;
  return `${DAY_SHORT[m.start.getDay()]} ${MONTH_SHORT[m.start.getMonth()]} ${m.start.getDate()}, ${hhmm(m.start)}`;
}

/** "Tuesdays", "Mon–Fri", "Mon, Wed, Fri", "Daily". */
function weeklyDays(days: number[]): string {
  if (days.length === 7) return "Daily";
  if (days.length === 1) return `${DAY_NAMES[days[0]]}s`;
  if (days.join() === "1,2,3,4,5") return "Mon–Fri";
  return days.map((d) => DAY_SHORT[d]).join(", ");
}

function andList(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} & ${items[items.length - 1]}`;
}

/** "Tuesdays 19:00–19:30", "2nd & 4th Thursday 20:00", "As needed" (NETL-021). */
export function describeSchedule(l: NetListingDetails): string {
  if (l.schedule_kind === "as_needed") return "As needed";
  const days =
    l.schedule_kind === "weekly"
      ? weeklyDays(l.weekdays)
      : `${andList(l.weeks.map((w) => WEEK_NAMES[w] ?? w))} ${
          l.weekdays.length === 1
            ? DAY_NAMES[l.weekdays[0]]
            : l.weekdays.map((d) => DAY_SHORT[d]).join(", ")
        }`;
  const time = l.end_time ? `${l.start_time}–${l.end_time}` : l.start_time;
  const text = `${days} ${time}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A date as "YYYY-MM-DD", local. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
