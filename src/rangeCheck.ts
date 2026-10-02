import type { Checkin, ContactDetails } from "./types";

/**
 * Range checks (docs/features/range-check.md). The backend checks the same
 * rules (src-tauri/src/range_check.rs); keep the lists in step.
 */

/** The only signal reports accepted, best to worst (RANGE-013). */
export const SIGNAL_REPORTS = [
  "Full quieting",
  "Slight noise",
  "Noisy but readable",
  "Broken",
  "Unreadable",
] as const;

/** Station types: stored id and what's shown (RANGE-010). */
export const STATION_KINDS = [
  { id: "mobile", label: "Mobile" },
  { id: "base", label: "Base" },
  { id: "ht", label: "HT" },
] as const;

export function stationKindLabel(id: string): string {
  return STATION_KINDS.find((k) => k.id === id)?.label ?? id;
}

/** Map colors for each report, best (green) to worst (red), in both themes (RANGE-021). */
export const SIGNAL_COLORS: Record<string, { fill: string; stroke: string }> = {
  "Full quieting": { fill: "#1a9850", stroke: "#0b4d27" },
  "Slight noise": { fill: "#91cf60", stroke: "#3f6b1f" },
  "Noisy but readable": { fill: "#fee08b", stroke: "#8a6d00" },
  Broken: { fill: "#fc8d59", stroke: "#8a3a0f" },
  Unreadable: { fill: "#d73027", stroke: "#6b0f0a" },
};

/** A range-check report as typed. */
export interface RangeDraft {
  crossStreet: string;
  /** The station's point, picked on the map only (RANGE-014). */
  lat: number | null;
  lon: number | null;
  stationKind: string;
  antenna: string;
  power: string;
  /** How net control hears the station. */
  weHear: string;
  /** How the station hears the repeater. */
  theyHear: string;
  notes: string;
}

export const EMPTY_RANGE: RangeDraft = {
  crossStreet: "",
  lat: null,
  lon: null,
  stationKind: "",
  antenna: "",
  power: "",
  weHear: "",
  theyHear: "",
  notes: "",
};

export type RangeField = "crossStreet" | "point" | "stationKind" | "antenna" | "power" | "weHear" | "theyHear";

/** What each required field is called in the "still needed" message. */
export const RANGE_FIELD_NAMES: Record<RangeField, string> = {
  crossStreet: "cross street",
  point: "point on the map",
  stationKind: "station type",
  antenna: "antenna",
  power: "power",
  weHear: "how we hear them",
  theyHear: "how they hear the repeater",
};

/** The required fields still missing, in form order (RANGE-011). Antenna only for a base. */
export function missingRangeFields(d: RangeDraft): RangeField[] {
  const missing: RangeField[] = [];
  if (!d.crossStreet.trim()) missing.push("crossStreet");
  if (d.lat == null || d.lon == null) missing.push("point");
  if (!d.stationKind) missing.push("stationKind");
  if (d.stationKind === "base" && !d.antenna.trim()) missing.push("antenna");
  if (!d.power.trim()) missing.push("power");
  if (!d.weHear) missing.push("weHear");
  if (!d.theyHear) missing.push("theyHear");
  return missing;
}

export function missingMessage(missing: RangeField[]): string {
  return `Still needed: ${missing.map((f) => RANGE_FIELD_NAMES[f]).join(", ")}.`;
}

/**
 * The draft as the backend takes it. The antenna goes only with a base
 * (RANGE-012); the time is left out ("now" when logging, "unchanged" when
 * correcting).
 */
export function toRangeContact(d: RangeDraft): ContactDetails {
  const t = (s: string) => s.trim() || null;
  return {
    station_kind: d.stationKind || null,
    cross_street: t(d.crossStreet),
    antenna: d.stationKind === "base" ? t(d.antenna) : null,
    power: t(d.power),
    rst_sent: d.weHear || null,
    rst_received: d.theyHear || null,
    notes: t(d.notes),
  };
}

export function rangeDraftFromCheckin(c: Checkin): RangeDraft {
  return {
    crossStreet: c.cross_street,
    lat: c.location_lat,
    lon: c.location_lon,
    stationKind: c.station_kind,
    antenna: c.antenna,
    power: c.power,
    weHear: c.rst_sent,
    theyHear: c.rst_received,
    notes: c.notes,
  };
}
