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

/** One net meeting. */
export interface DayEntry {
  listing: NetListing;
  meeting: Meeting;
}

/** One net under one weekday of the week. */
export interface WeekEntry {
  listing: NetListing;
  /** Its next meeting on this weekday (today's while not over); null if none in reach. */
  meeting: Meeting | null;
  /** Met earlier today and is over. */
  overToday: boolean;
}

/** One weekday of the week, the same whatever day it is. */
export interface WeekDay {
  /** 0 = Sunday. */
  weekday: number;
  /** "Sunday". */
  name: string;
  today: boolean;
  /** By start time, then name. */
  entries: WeekEntry[];
}

export interface WeekView {
  /** Sunday to Saturday. */
  days: WeekDay[];
  /** "As needed" nets, by name. */
  asNeeded: NetListing[];
}

const byName = (a: NetListing, b: NetListing) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

const hasTime = (l: NetListingDetails) => l.schedule_kind !== "as_needed" && /^\d\d:\d\d$/.test(l.start_time);

/** A meeting on `day` at the listing's times. */
function meetingOn(l: NetListingDetails, day: Date, now: Date): Meeting {
  const start = at(day, l.start_time);
  const end = l.end_time ? at(day, l.end_time) : new Date(start.getTime() + ASSUMED_MINUTES * 60_000);
  return { start, end, underway: start <= now && now < end };
}

/** The net's next meeting on this weekday that isn't over, from today on. */
function nextOnWeekday(l: NetListingDetails, weekday: number, now: Date): Meeting | null {
  for (let i = (weekday - now.getDay() + 7) % 7; i <= LOOKAHEAD_DAYS; i += 7) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (!meetsOn(l, day)) continue;
    const m = meetingOn(l, day, now);
    if (m.end > now) return m;
  }
  return null;
}

/**
 * The nets by weekday, Sunday to Saturday, so the week looks the same
 * whatever day it is (NETL-020): each net under every weekday it meets on
 * (a monthly net too), by start time. Today is marked; its nets carry
 * today's meeting, and one already over says so.
 */
export function weekView(listings: NetListing[], now: Date): WeekView {
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const scheduled = listings.filter(hasTime);
  const days = DAY_NAMES.map((name, weekday) => {
    const today = weekday === now.getDay();
    const entries = scheduled
      .filter((l) => l.weekdays.includes(weekday))
      .map((listing) => ({
        listing,
        meeting: nextOnWeekday(listing, weekday, now),
        overToday: today && meetsOn(listing, todayDate) && meetingOn(listing, todayDate, now).end <= now,
      }))
      .sort((a, b) => a.listing.start_time.localeCompare(b.listing.start_time) || byName(a.listing, b.listing));
    return { weekday, name, today, entries };
  });
  const asNeeded = listings.filter((l) => l.schedule_kind === "as_needed").sort(byName);
  return { days, asNeeded };
}

/** Which weeks of the month a monthly net meets: "2nd & 4th", "last"; "" when weekly. */
export function monthlyWeeks(l: NetListingDetails): string {
  return l.schedule_kind === "monthly" ? andList(l.weeks.map((w) => WEEK_NAMES[w] ?? w)) : "";
}

function hhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * The nets for "Coming up" (NETL-025): those on now or starting within the
 * next `hours`, each once at its next meeting, soonest first.
 */
export function comingUp(listings: NetListing[], now: Date, hours = 12): DayEntry[] {
  const until = now.getTime() + hours * 60 * 60_000;
  return listings
    .flatMap((listing) => {
      const meeting = nextMeeting(listing, now);
      return meeting && meeting.start.getTime() < until ? [{ listing, meeting }] : [];
    })
    .sort((a, b) => a.meeting.start.getTime() - b.meeting.start.getTime() || byName(a.listing, b.listing));
}

/**
 * When a meeting starts, as a glance would want it: "On now · until 08:00",
 * "in 25 min", "in 2 h 10 min" (within 12 hours), else "Tomorrow 07:30",
 * "Wed 21:00" (within the week), "Thu Oct 15 20:00".
 */
export function startsIn(m: Meeting, now: Date): string {
  if (m.underway) return `On now · until ${hhmm(m.end)}`;
  const mins = Math.round((m.start.getTime() - now.getTime()) / 60_000);
  if (mins < 60) return `in ${Math.max(mins, 1)} min`;
  if (mins < 12 * 60) return `in ${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ""}`;
  const days = Math.round(
    (new Date(m.start.getFullYear(), m.start.getMonth(), m.start.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000
  );
  if (days === 0) return `Today ${hhmm(m.start)}`;
  if (days === 1) return `Tomorrow ${hhmm(m.start)}`;
  if (days < 7) return `${DAY_SHORT[m.start.getDay()]} ${hhmm(m.start)}`;
  return `${DAY_SHORT[m.start.getDay()]} ${MONTH_SHORT[m.start.getMonth()]} ${m.start.getDate()} ${hhmm(m.start)}`;
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
