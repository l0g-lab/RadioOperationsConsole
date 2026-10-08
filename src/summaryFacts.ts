import type { ActivitySummary } from "./types";
import { visibleSections } from "./activityTypes";
import { attachedAlertText } from "./nwsAlerts";

export interface SummaryFact {
  key: string;
  /** The headline, e.g. "12 check-ins". */
  text: string;
  /** Extra detail after the headline, e.g. "(9 unique stations)". */
  detail?: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The counts to show for an activity of this type: the sections the type
 * emphasises, plus any that hold records. Everything that shows a summary
 * (the end-of-net step, the Operations panel, the saved text) uses this, so
 * they always agree.
 */
export function summaryFacts(type: string, s: ActivitySummary): SummaryFact[] {
  const shown = visibleSections(type, s);
  const facts: SummaryFact[] = [];
  if (shown.has("checkins")) {
    facts.push({
      key: "checkins",
      text: plural(s.checkins, "check-in", "check-ins"),
      detail: `(${plural(s.unique_stations, "unique station", "unique stations")})`,
    });
  }
  if (shown.has("traffic")) {
    facts.push({
      key: "traffic",
      text: `${plural(s.traffic_items, "check-in", "check-ins")} with traffic`,
      detail: s.open_traffic_items > 0 ? `(${s.open_traffic_items} not marked handled)` : undefined,
    });
  }
  if (shown.has("spotter")) {
    facts.push({
      key: "spotter",
      text: plural(s.spotter_reports, "spotter report", "spotter reports"),
      detail:
        s.hazards.length > 0
          ? `(${s.hazards.map((h) => `${h.hazard_type} ${h.count}`).join(", ")})`
          : undefined,
    });
  }
  if (shown.has("relay")) {
    const held = s.held_relay_messages;
    const unpassed = s.unpassed_relay_messages;
    const total = s.relay_messages;
    const parts = [
      `${total - held - unpassed} passed`,
      held > 0 ? `${held} still held` : "",
      unpassed > 0 ? `${unpassed} not passed` : "",
    ].filter(Boolean);
    facts.push({
      key: "relay",
      text: plural(total, "relayed message", "relayed messages"),
      detail: total > 0 ? `(${parts.join(", ")})` : undefined,
    });
  }
  return facts;
}

/** A summary line after the counts: a label and one or more lines of text. */
export interface StormLine {
  key: string;
  label: string;
  lines: string[];
}

/**
 * What a SKYWARN net's summary adds after its counts (SPOT-056, SPOT-060):
 * the largest hail and strongest wind reported, reports by county, and the
 * NWS alerts attached to it. Shown in the summary and in its saved text.
 */
export function stormLines(s: ActivitySummary): StormLine[] {
  const out: StormLine[] = [];
  if (s.largest_hail) out.push({ key: "hail", label: "Largest hail", lines: [s.largest_hail] });
  if (s.strongest_wind) out.push({ key: "wind", label: "Strongest wind", lines: [s.strongest_wind] });
  if (s.counties.length > 0) {
    out.push({
      key: "counties",
      label: "By county",
      lines: [s.counties.map((c) => `${c.county} ${c.count}`).join(", ")],
    });
  }
  if (s.alerts.length > 0) {
    out.push({ key: "alerts", label: s.alerts.length === 1 ? "NWS alert" : "NWS alerts", lines: s.alerts.map(attachedAlertText) });
  }
  return out;
}
