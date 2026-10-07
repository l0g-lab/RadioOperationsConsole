import type { Activity, Operator } from "./types";

/** A labelled point on the check-in map: net control or the repeater. */
export interface MapPoint {
  lat: number;
  lon: number;
  label: string;
}

/**
 * Where net control is: the activity's own location (a field site, say),
 * else the operator's usual one (CIMAP-060).
 */
export function netControlPoint(activity: Activity | null, operator: Operator | null): MapPoint | null {
  if (activity?.location_lat != null && activity.location_lon != null) {
    return { lat: activity.location_lat, lon: activity.location_lon, label: activity.location_label || activity.title };
  }
  if (operator?.location_lat != null && operator.location_lon != null) {
    return { lat: operator.location_lat, lon: operator.location_lon, label: operator.location_label || operator.display_name };
  }
  return null;
}

/** The repeater the activity runs on, kept apart from net control (RPT-021). */
export function repeaterPoint(activity: Activity | null): MapPoint | null {
  return activity?.repeater_lat != null && activity.repeater_lon != null
    ? { lat: activity.repeater_lat, lon: activity.repeater_lon, label: activity.repeater_name || "the repeater" }
    : null;
}
