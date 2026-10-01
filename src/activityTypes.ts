import type { ActivitySummary } from "./types";

/**
 * The kinds of activity, and what each emphasises in its summary.
 *
 * This is the one place types are defined. To add one, add an entry here:
 * the database stores the `id` as plain text and needs no change, and the
 * pickers, top bar, and summaries read from this list.
 */

/** A part of the activity summary. */
export type SummarySection = "checkins" | "traffic" | "spotter";

export interface ActivityTypeDef {
  /** Stored on the activity. Never change an existing id. */
  id: string;
  label: string;
  description: string;
  /** Sections shown in summaries even when they're empty. */
  sections: SummarySection[];
  /**
   * A running log rather than a net: never started or ended, and its records
   * are contacts with radio details (frequency, mode, RST, power, antenna,
   * notes) instead of check-ins with traffic.
   */
  log?: boolean;
}

export const ACTIVITY_TYPES: ActivityTypeDef[] = [
  {
    id: "simple_net",
    label: "Simple net",
    description: "A casual net: just check-ins.",
    sections: ["checkins"],
  },
  {
    id: "directed_net",
    label: "Directed net",
    description: "A net run by a net control: check-ins and traffic.",
    sections: ["checkins", "traffic"],
  },
  {
    id: "skywarn",
    label: "SKYWARN",
    description: "Severe-weather activation: check-ins and spotter reports by hazard.",
    sections: ["checkins", "spotter", "traffic"],
  },
  {
    id: "station_log",
    label: "Station log",
    description:
      "An ongoing log of your own contacts (e.g. VHF simplex), with no start or end: frequency, mode, signal reports, power, antenna, and notes.",
    sections: ["checkins"],
    log: true,
  },
  {
    id: "other",
    label: "Other",
    description: "Anything else. Shows everything.",
    sections: ["checkins", "traffic", "spotter"],
  },
];

/** New activities start as this. */
export const DEFAULT_ACTIVITY_TYPE = "directed_net";

/** A type stored by a newer version, or an old value, is shown by name and treated as "Other". */
export function activityTypeDef(id: string): ActivityTypeDef {
  const known = ACTIVITY_TYPES.find((t) => t.id === id);
  if (known) return known;
  const other = ACTIVITY_TYPES.find((t) => t.id === "other") as ActivityTypeDef;
  return { ...other, id, label: id.replace(/_/g, " ") || other.label };
}

/** Whether this type is a running contact log rather than a net. */
export function isLog(id: string): boolean {
  return activityTypeDef(id).log === true;
}

export function activityTypeLabel(id: string): string {
  return activityTypeDef(id).label;
}

/**
 * Which summary sections to show: the ones the type emphasises, plus any
 * section that actually has records. Changing an activity's type never hides
 * data that exists.
 */
export function visibleSections(type: string, s: ActivitySummary): Set<SummarySection> {
  const shown = new Set<SummarySection>(activityTypeDef(type).sections);
  shown.add("checkins");
  if (s.traffic_items > 0) shown.add("traffic");
  if (s.spotter_reports > 0) shown.add("spotter");
  return shown;
}
