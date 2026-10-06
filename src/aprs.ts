/**
 * The APRS tab in words (aprs-is-live-feed.md): packets grouped into
 * stations, each with what kind of station it is (from its APRS symbol), how
 * long since it was heard, how far and which way from the area's center, and
 * a weather station's report in plain words.
 */
import type { AprsIsPacket } from "./types";
import { haversineKm, kmToMiles } from "./geo";
import { compassPoint } from "./netWeather";

/** Colored on the map and in the list by group. */
export type StationGroup = "moving" | "fixed" | "weather" | "infrastructure";

export interface StationKind {
  /** "Mobile", "Home", "Weather", "Digipeater"… */
  label: string;
  /** For the icon. */
  kind: "car" | "truck" | "home" | "weather" | "digi" | "igate" | "foot" | "boat" | "plane" | "bike" | "emergency" | "station";
  group: StationGroup;
}

/** APRS symbol codes (the primary table's) by what they stand for. */
const SYMBOLS: Record<string, StationKind> = {
  ">": { label: "Mobile", kind: "car", group: "moving" },
  "<": { label: "Motorcycle", kind: "car", group: "moving" },
  j: { label: "Mobile", kind: "car", group: "moving" },
  v: { label: "Van", kind: "truck", group: "moving" },
  k: { label: "Truck", kind: "truck", group: "moving" },
  u: { label: "Truck", kind: "truck", group: "moving" },
  U: { label: "Bus", kind: "truck", group: "moving" },
  R: { label: "RV", kind: "truck", group: "moving" },
  b: { label: "Bicycle", kind: "bike", group: "moving" },
  "[": { label: "On foot", kind: "foot", group: "moving" },
  Y: { label: "Boat", kind: "boat", group: "moving" },
  s: { label: "Boat", kind: "boat", group: "moving" },
  "'": { label: "Aircraft", kind: "plane", group: "moving" },
  "^": { label: "Aircraft", kind: "plane", group: "moving" },
  a: { label: "Ambulance", kind: "emergency", group: "moving" },
  f: { label: "Fire truck", kind: "emergency", group: "moving" },
  "!": { label: "Police", kind: "emergency", group: "moving" },
  "-": { label: "Home", kind: "home", group: "fixed" },
  y: { label: "Home", kind: "home", group: "fixed" },
  o: { label: "EOC", kind: "emergency", group: "fixed" },
  _: { label: "Weather", kind: "weather", group: "weather" },
  W: { label: "Weather service", kind: "weather", group: "weather" },
  "#": { label: "Digipeater", kind: "digi", group: "infrastructure" },
  "&": { label: "IGate", kind: "igate", group: "infrastructure" },
  r: { label: "Repeater", kind: "digi", group: "infrastructure" },
};

const UNKNOWN: StationKind = { label: "Station", kind: "station", group: "fixed" };

/** What kind of station a symbol stands for; "Station" if it isn't one we know. */
export function stationKind(symbol: string | null | undefined): StationKind {
  const code = symbol ? symbol[symbol.length - 1] : "";
  return SYMBOLS[code] ?? UNKNOWN;
}

/**
 * An APRS weather report in words, from the comment of a weather station's
 * position ("275/012g018t088r000p012h78b10142 Davis VP2"): "88°F · wind W
 * 12 mph gusting 18 · humidity 78% · 1014 hPa", and whatever text followed
 * ("Davis VP2"). Null when the comment isn't a weather report.
 */
export function weatherReport(comment: string | null | undefined): { text: string; rest: string } | null {
  const m = (comment ?? "").match(/^(\d{3}|\.{3}|\s{3})\/(\d{3}|\.{3}|\s{3})/);
  if (!m) return null;
  const fields: Record<string, number> = {};
  let i = m[0].length;
  const s = comment as string;
  // Letter + fixed-width value: g gust, t temp (°F, may be negative), r/p/P rain, h humidity, b pressure, L/l luminosity.
  const width: Record<string, number> = { g: 3, t: 3, r: 3, p: 3, P: 3, h: 2, b: 5, L: 3, l: 3 };
  while (i < s.length && width[s[i]]) {
    const key = s[i];
    const raw = s.slice(i + 1, i + 1 + width[key]);
    if (raw.length < width[key]) break;
    const n = Number(raw);
    if (!raw.includes(".") && raw.trim() !== "" && Number.isFinite(n)) fields[key] = n;
    i += 1 + width[key];
  }
  const dir = Number(m[1]);
  const speed = Number(m[2]);
  const parts: string[] = [];
  if ("t" in fields) parts.push(`${fields.t}°F`);
  if (Number.isFinite(speed)) {
    if (speed === 0 && !(fields.g > 0)) parts.push("calm");
    else {
      const from = Number.isFinite(dir) && speed > 0 ? `${compassPoint(dir)} ` : "";
      const gust = fields.g > speed ? ` gusting ${fields.g}` : "";
      parts.push(`wind ${from}${speed} mph${gust}`);
    }
  }
  if (fields.r > 0) parts.push(`rain ${(fields.r / 100).toFixed(2)} in last hour`);
  if ("h" in fields) parts.push(`humidity ${fields.h === 0 ? 100 : fields.h}%`);
  if ("b" in fields) parts.push(`${Math.round(fields.b / 10)} hPa`);
  if (parts.length === 0) return null;
  return { text: parts.join(" · "), rest: s.slice(i).trim() };
}

export interface Station {
  call: string;
  kind: StationKind;
  /** When it was last heard (any packet). */
  heardAt: string;
  /** Its latest position, or null if none has been decoded. */
  lat: number | null;
  lon: number | null;
  /** Its positions, oldest first, distinct — a moving station's trail. */
  trail: [number, number][];
  /** Its latest comment (a weather station's in words), or "". */
  comment: string;
  packets: number;
  /** From the area's center, e.g. "4.2 mi NE"; "" without a position. */
  distance: string;
  /** For sorting by distance; Infinity without a position. */
  km: number;
}

/** Initial bearing, in degrees, from one point to another. */
function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

/** "4.2 mi NE", "12 mi SW", "here" within a tenth of a mile. */
export function distanceText(km: number, deg: number): string {
  const mi = kmToMiles(km);
  if (mi < 0.1) return "here";
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi ${compassPoint(deg)}`;
}

/**
 * The feed's packets as stations: one per call sign, at its latest position,
 * with its trail and latest comment; most recently heard first.
 */
export function stationsFrom(packets: AprsIsPacket[], center: { lat: number; lon: number } | null): Station[] {
  const byCall = new Map<string, AprsIsPacket[]>();
  for (const p of packets) byCall.set(p.source, [...(byCall.get(p.source) ?? []), p]);
  const time = (p: AprsIsPacket) => Date.parse(p.received_at) || 0;
  const stations: Station[] = [];
  for (const [call, list] of byCall) {
    const ordered = [...list].sort((a, b) => time(a) - time(b));
    const latest = ordered[ordered.length - 1];
    const placed = ordered.filter((p) => p.lat != null && p.lon != null);
    const where = placed[placed.length - 1];
    const trail: [number, number][] = [];
    for (const p of placed) {
      const pt: [number, number] = [p.lat as number, p.lon as number];
      const last = trail[trail.length - 1];
      if (!last || last[0] !== pt[0] || last[1] !== pt[1]) trail.push(pt);
    }
    const symbol = [...ordered].reverse().find((p) => p.symbol)?.symbol ?? null;
    const commentRaw = [...ordered].reverse().find((p) => p.comment)?.comment ?? "";
    const wx = weatherReport(commentRaw);
    const km = where && center ? haversineKm(center.lat, center.lon, where.lat as number, where.lon as number) : Infinity;
    stations.push({
      call,
      kind: wx && stationKind(symbol).kind === "station" ? SYMBOLS._ : stationKind(symbol),
      heardAt: latest.received_at,
      lat: where ? (where.lat as number) : null,
      lon: where ? (where.lon as number) : null,
      trail,
      comment: wx ? [wx.text, wx.rest].filter(Boolean).join(" — ") : commentRaw.trim(),
      packets: list.length,
      distance:
        where && center
          ? distanceText(km, bearing(center.lat, center.lon, where.lat as number, where.lon as number))
          : "",
      km,
    });
  }
  return stations.sort((a, b) => (Date.parse(b.heardAt) || 0) - (Date.parse(a.heardAt) || 0));
}

/** "just now", "4 min ago", "1 h 5 min ago". */
export function heardAgo(iso: string, now: Date): string {
  const mins = Math.floor((now.getTime() - (Date.parse(iso) || now.getTime())) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
}

/** Quiet long enough to dim: not heard in the last 15 minutes. */
export const QUIET_MS = 15 * 60_000;
