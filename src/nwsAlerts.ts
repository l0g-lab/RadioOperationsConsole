/**
 * NWS alerts as the Weather tab lists them (nws-alerts.md): warnings in red,
 * as the app marks what needs acting on now, and watches, advisories and
 * statements in amber; the most serious first, with when each ends.
 */
import type { Geometry } from "geojson";
import type { ActivityAlert } from "./types";
import { pad2 } from "./utils";

export interface NwsAlert {
  /** NWS's own id for the alert. */
  id?: string;
  event?: string;
  severity?: string;
  areaDesc?: string;
  headline?: string;
  description?: string;
  instruction?: string;
  effective?: string;
  /** When the hazard itself begins, if NWS says (effective is when the message took effect). */
  onset?: string | null;
  expires?: string;
  /** When the hazard itself ends, if NWS says (expires is when the message does). */
  ends?: string | null;
  /** NWS's extra fields; VTEC names the event an alert belongs to, across its updates. */
  parameters?: { VTEC?: string[] };
  /** The area it covers, for outlining on the radar map; null for one given only by county zones. */
  geometry?: Geometry | null;
}

/** An alert from an NWS API GeoJSON feature, keeping its area to outline. */
export function alertFromFeature(f: { properties?: NwsAlert; geometry?: NwsAlert["geometry"] }): NwsAlert {
  return { ...(f.properties ?? {}), geometry: f.geometry ?? null };
}

// The colors NWS gives each kind of alert on its maps (weather.gov's hazard
// map), so an alert's outline on the radar and its swatch in the list match
// what operators see on NWS's own sites. The five storm warnings use
// radar.weather.gov's colors instead, since NOAA's warnings layer on the
// radar draws them that way (RADAR-018, RADAR-019).
const ALERT_COLORS: Record<string, string> = {
  "Tornado Warning": "#FF0000",
  "Severe Thunderstorm Warning": "#FFFF00",
  "Flash Flood Warning": "#397939",
  "Special Marine Warning": "#E69800",
  "Snow Squall Warning": "#C71585",
  "Tsunami Warning": "#FD6347",
  "Extreme Wind Warning": "#FF8C00",
  "Flash Flood Statement": "#8B0000",
  "Severe Weather Statement": "#00FFFF",
  "Shelter In Place Warning": "#FA8072",
  "Evacuation Immediate": "#7FFF00",
  "Civil Danger Warning": "#FFB6C1",
  "Civil Emergency Message": "#FFB6C1",
  "Hazardous Materials Warning": "#4B0082",
  "Fire Warning": "#A0522D",
  "Storm Surge Warning": "#B524F7",
  "Hurricane Force Wind Warning": "#CD5C5C",
  "Hurricane Warning": "#DC143C",
  "Typhoon Warning": "#DC143C",
  "Blizzard Warning": "#FF4500",
  "Ice Storm Warning": "#8B008B",
  "Winter Storm Warning": "#FF69B4",
  "High Wind Warning": "#DAA520",
  "Tropical Storm Warning": "#B22222",
  "Storm Warning": "#9400D3",
  "Tsunami Advisory": "#D2691E",
  "Tsunami Watch": "#FF00FF",
  "Avalanche Warning": "#1E90FF",
  "Coastal Flood Warning": "#228B22",
  "Lakeshore Flood Warning": "#228B22",
  "Flood Warning": "#00FF00",
  "High Surf Warning": "#228B22",
  "Dust Storm Warning": "#FFE4C4",
  "Lake Effect Snow Warning": "#008B8B",
  "Excessive Heat Warning": "#C71585",
  "Extreme Heat Warning": "#C71585",
  "Tornado Watch": "#FFFF00",
  "Severe Thunderstorm Watch": "#DB7093",
  "Flash Flood Watch": "#2E8B57",
  "Gale Warning": "#DDA0DD",
  "Flood Statement": "#00FF00",
  "Extreme Cold Warning": "#0000FF",
  "Wind Chill Warning": "#B0C4DE",
  "Hard Freeze Warning": "#9400D3",
  "Freeze Warning": "#483D8B",
  "Red Flag Warning": "#FF1493",
  "Storm Surge Watch": "#DB7FF7",
  "Hurricane Watch": "#FF00FF",
  "Hurricane Force Wind Watch": "#9932CC",
  "Typhoon Watch": "#FF00FF",
  "Tropical Storm Watch": "#F08080",
  "Storm Watch": "#FFE4B5",
  "Hurricane Local Statement": "#FFE4B5",
  "Tropical Cyclone Local Statement": "#FFE4B5",
  "Winter Storm Watch": "#4682B4",
  "Winter Weather Advisory": "#7B68EE",
  "Wind Chill Advisory": "#AFEEEE",
  "Cold Weather Advisory": "#AFEEEE",
  "Heat Advisory": "#FF7F50",
  "Flood Advisory": "#00FF7F",
  "Coastal Flood Advisory": "#7CFC00",
  "Lakeshore Flood Advisory": "#7CFC00",
  "High Surf Advisory": "#BA55D3",
  "Heavy Freezing Spray Warning": "#00BFFF",
  "Dense Fog Advisory": "#708090",
  "Dense Smoke Advisory": "#F0E68C",
  "Small Craft Advisory": "#D8BFD8",
  "Brisk Wind Advisory": "#D8BFD8",
  "Hazardous Seas Warning": "#D8BFD8",
  "Dust Advisory": "#BDB76B",
  "Blowing Dust Advisory": "#BDB76B",
  "Lake Wind Advisory": "#D2B48C",
  "Wind Advisory": "#D2B48C",
  "Frost Advisory": "#6495ED",
  "Freezing Fog Advisory": "#008080",
  "Freezing Spray Advisory": "#00BFFF",
  "Low Water Advisory": "#A52A2A",
  "Avalanche Watch": "#F4A460",
  "Rip Current Statement": "#40E0D0",
  "Beach Hazards Statement": "#40E0D0",
  "Gale Watch": "#FFC0CB",
  "Hazardous Seas Watch": "#483D8B",
  "Coastal Flood Watch": "#66CDAA",
  "Lakeshore Flood Watch": "#66CDAA",
  "Flood Watch": "#2E8B57",
  "High Wind Watch": "#B8860B",
  "Excessive Heat Watch": "#800000",
  "Extreme Heat Watch": "#800000",
  "Extreme Cold Watch": "#5F9EA0",
  "Wind Chill Watch": "#5F9EA0",
  "Lake Effect Snow Watch": "#87CEFA",
  "Hard Freeze Watch": "#4169E1",
  "Freeze Watch": "#00FFFF",
  "Fire Weather Watch": "#FFDEAD",
  "Special Weather Statement": "#FFE4B5",
  "Marine Weather Statement": "#FFDAB9",
  "Air Quality Alert": "#808080",
  "Hazardous Weather Outlook": "#EEE8AA",
  "Hydrologic Outlook": "#90EE90",
};

/** The color NWS draws this kind of alert in; gray for one it has no color for. */
export function alertColor(event: string | undefined): string {
  return ALERT_COLORS[event ?? ""] ?? "#A0A0A0";
}

/** "danger" for a warning (or an emergency), "warning" for anything else. */
export function alertLevel(event: string | undefined): "danger" | "warning" {
  return /warning|emergency/i.test(event ?? "") ? "danger" : "warning";
}

const SEVERITY_RANK: Record<string, number> = { extreme: 0, severe: 1, moderate: 2, minor: 3 };

/** Warnings first, then by severity, then the soonest to end. */
export function sortAlerts(alerts: NwsAlert[]): NwsAlert[] {
  const level = (a: NwsAlert) => (alertLevel(a.event) === "danger" ? 0 : 1);
  const rank = (a: NwsAlert) => SEVERITY_RANK[(a.severity ?? "").toLowerCase()] ?? 4;
  const end = (a: NwsAlert) => Date.parse(a.ends || a.expires || "") || Infinity;
  return [...alerts].sort((a, b) => level(a) - level(b) || rank(a) - rank(b) || end(a) - end(b));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "until 16:00" today (local time), "until Tue 08:00" on another day; "" if unknown. */
export function untilText(a: NwsAlert, now = new Date()): string {
  const end = new Date(a.ends || a.expires || "");
  if (Number.isNaN(end.getTime())) return "";
  const hm = `${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
  return end.toDateString() === now.toDateString() ? `until ${hm}` : `until ${WEEKDAYS[end.getDay()]} ${hm}`;
}

/** What a net keeps of an alert when it's attached (SPOT-060). */
export function toAttachedAlert(a: NwsAlert): Omit<ActivityAlert, "id" | "attached_at"> {
  return {
    nws_id: a.id ?? "",
    event: a.event ?? "Alert",
    headline: a.headline ?? "",
    area_desc: a.areaDesc ?? "",
    severity: a.severity ?? "",
    effective: a.onset || a.effective || "",
    ends: a.ends || a.expires || "",
  };
}

/** Local "2026-10-05 19:30", or "" for a missing time. */
function localMinute(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "2026-10-05 19:30 to 20:15" (the end's date only when it's another day), local time. */
export function alertSpanText(effective: string, ends: string): string {
  const [from, to] = [localMinute(effective), localMinute(ends)];
  if (!from) return to ? `until ${to}` : "";
  if (!to) return `from ${from}`;
  return `${from} to ${to.slice(0, 10) === from.slice(0, 10) ? to.slice(11) : to}`;
}

/** "Tornado Warning — Orange, Seminole — 2026-10-05 19:30 to 20:15", for the summary. */
export function attachedAlertText(a: Pick<ActivityAlert, "event" | "area_desc" | "effective" | "ends">): string {
  return [a.event, areaText(a.area_desc), alertSpanText(a.effective, a.ends)].filter(Boolean).join(" — ");
}

/** NWS text, hard-wrapped at ~70 columns, as paragraphs: blank lines split them, single newlines are just wrapping. */
export function paragraphs(text: string | undefined): string[] {
  return (text ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

/** "Orange, FL; Seminole, FL" -> "Orange, Seminole" when they're all in one state. */
export function areaText(areaDesc: string | undefined): string {
  const parts = (areaDesc ?? "").split(";").map((p) => p.trim()).filter(Boolean);
  const states = new Set(parts.map((p) => p.match(/,\s*([A-Z]{2})$/)?.[1] ?? ""));
  if (parts.length > 0 && states.size === 1 && !states.has("")) {
    return parts.map((p) => p.replace(/,\s*[A-Z]{2}$/, "")).join(", ");
  }
  return parts.join("; ");
}
