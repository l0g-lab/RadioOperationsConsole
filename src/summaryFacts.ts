import type { ActivitySummary } from "./types";
import { visibleSections } from "./activityTypes";

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
  return facts;
}
