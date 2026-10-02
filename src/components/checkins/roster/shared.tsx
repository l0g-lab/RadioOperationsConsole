import type { Checkin } from "../../../types";
import { formatDistance, haversineKm, kmToMiles } from "../../../geo";
import { formatTimeLines } from "../../../utils";

/** Where distances are measured from: the repeater, else net control. */
export interface Place {
  lat: number;
  lon: number;
  label: string;
}

/** "77.2 mi", or "206 mi" from 100 miles up, to fit a narrow column. */
export function shortMiles(km: number): string {
  const mi = kmToMiles(km);
  return `${mi < 100 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

/** A row's distance column: miles, with kilometers and the reference point on hover. */
export function DistanceCell({ checkin: c, from }: { checkin: Checkin; from: Place | null }) {
  if (!from || c.location_lat == null || c.location_lon == null) return <span />;
  const km = haversineKm(from.lat, from.lon, c.location_lat, c.location_lon);
  return (
    <span className="checkin-row-mono checkin-row-nowrap" title={`${formatDistance(km)} from ${from.label}`}>
      {shortMiles(km)}
    </span>
  );
}

/** The distance heading, saying where it's measured from or how to set that point. */
export function DistanceHeading({ from, howToSet }: { from: Place | null; howToSet: string }) {
  return (
    <span title={from ? `Straight-line distance from ${from.label}` : howToSet}>Distance</span>
  );
}

/** Local and UTC time, one above the other. */
export function TimeCell({ at }: { at: string }) {
  const t = formatTimeLines(at);
  return (
    <span className="checkin-row-time">
      <span>{t.local}</span>
      <span>{t.utc}</span>
    </span>
  );
}

/** Text that may not fit its column: cut off, with the full text on hover. */
export function ClipCell({ text }: { text: string }) {
  return (
    <span className="checkin-row-clip" title={text || undefined}>
      {text}
    </span>
  );
}

/** Props every display row takes. */
export interface RowProps {
  checkin: Checkin;
  selected: boolean;
  onSelect: () => void;
}
