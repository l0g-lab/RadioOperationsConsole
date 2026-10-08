import { formatCoords } from "../../../geo";
import { locationText } from "../../../checkinLocation";
import type { Checkin } from "../../../types";
import { LocationMark, TimeCell, type RowProps } from "./shared";
import { howText } from "../../../placeText";

/** A net's column headings; a SKYWARN net's last column also holds its reports. */
export function NetColumns({ reports = false }: { reports?: boolean }) {
  return (
    <div className="checkin-row checkin-row-columns">
      <span>Call Sign</span>
      <span>Name</span>
      <span>Location</span>
      <span>Grid</span>
      <span className="checkin-row-time">Time</span>
      <span>{reports ? "Traffic & reports" : "Traffic"}</span>
    </div>
  );
}

/** A station's reports in a word or two: "Hail ×2, Wind Damage", in the order first reported. */
export function reportSummary(hazards: string[]): string {
  const counts = new Map<string, number>();
  for (const h of hazards) counts.set(h, (counts.get(h) ?? 0) + 1);
  return [...counts].map(([h, n]) => (n > 1 ? `${h} ×${n}` : h)).join(", ");
}

/** Everything about where a station is, for the Location cell's tooltip. */
function locationDetails(c: Checkin): string {
  return [
    c.address && `Address: ${c.address}`,
    c.qth_location && c.qth_location !== c.address && `QTH: ${c.qth_location}`,
    c.location_lat != null && c.location_lon != null
      ? `On the map: ${formatCoords(c.location_lat, c.location_lon)}${
          howText(c.location_how) ? `\n${howText(c.location_how)}` : c.location_manual ? " (placed by hand)" : ""
        }`
      : `Not on the map${howText(c.location_how) ? `\n${howText(c.location_how)}` : ""}`,
    c.grid_square && `Grid square: ${c.grid_square}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * A net check-in, with its traffic and whether it's been handled on the same
 * row. On a SKYWARN net the row also shows the station's reports and a Report
 * button that takes one from them (SPOT-024).
 */
export function NetRow({
  checkin: c,
  selected,
  onSelect,
  onTrafficHandled,
  reports,
  onReport,
}: RowProps & {
  onTrafficHandled: (handled: boolean) => void;
  /** Hazards of the reports linked to this check-in, oldest first (SKYWARN). */
  reports?: string[];
  /** Takes a report from this station (SKYWARN, while the net is open). */
  onReport?: () => void;
}) {
  return (
    <div className={"checkin-row" + (selected ? " selected" : "")} onClick={onSelect}>
      <span className="checkin-row-call">{c.call_sign}</span>
      <span className="checkin-row-name">{c.name || ""}</span>
      {/* The town or address; the rest is in the tooltip (CIMAP-081). */}
      <span className="checkin-row-location" title={locationDetails(c)}>
        <LocationMark placed={c.location_lat != null && c.location_lon != null} how={c.location_how} />
        <span className="checkin-row-location-text">{locationText(c)}</span>
      </span>
      <span className="checkin-row-grid">{c.grid_square}</span>
      <TimeCell at={c.checked_in_at} />
      {/* Shown as it is, with Handled beside it (NETOPS-053). */}
      <span className={"checkin-row-traffic" + (c.traffic_handled ? " checkin-row-traffic-handled" : "")}>
        {c.has_traffic && (
          <>
            <span className="checkin-row-traffic-text" title={c.traffic || undefined}>
              {c.traffic || <em>Traffic — no details yet</em>}
            </span>
            <label className="checkbox-row traffic-handled" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={c.traffic_handled}
                onChange={(e) => onTrafficHandled(e.target.checked)}
              />
              Handled
            </label>
          </>
        )}
        {reports && reports.length > 0 && (
          <span className="checkin-row-reports" title={`Reports: ${reportSummary(reports)}`}>
            {reportSummary(reports)}
          </span>
        )}
        {onReport && (
          <button
            className="checkin-row-report"
            onClick={(e) => {
              e.stopPropagation();
              onReport();
            }}
            title={
              c.has_traffic && !c.traffic_handled
                ? "Take a spotter report from this station, starting from its traffic"
                : "Take a spotter report from this station"
            }
          >
            Report
          </button>
        )}
      </span>
    </div>
  );
}
