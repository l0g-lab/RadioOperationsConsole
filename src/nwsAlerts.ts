/**
 * NWS alerts as the Weather tab lists them (nws-alerts.md): warnings in red,
 * as the app marks what needs acting on now, and watches, advisories and
 * statements in amber; the most serious first, with when each ends.
 */
import { pad2 } from "./utils";

export interface NwsAlert {
  event?: string;
  severity?: string;
  areaDesc?: string;
  headline?: string;
  description?: string;
  instruction?: string;
  effective?: string;
  expires?: string;
  /** When the hazard itself ends, if NWS says (expires is when the message does). */
  ends?: string | null;
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
