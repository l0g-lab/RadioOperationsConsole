import { formatCoords } from "../../../geo";
import { locationText } from "../../../checkinLocation";
import type { Checkin } from "../../../types";
import { MapPin } from "lucide-react";
import { TimeCell, type RowProps } from "./shared";

/** A net's column headings. */
export function NetColumns() {
  return (
    <div className="checkin-row checkin-row-columns">
      <span>Call Sign</span>
      <span>Name</span>
      <span>Location</span>
      <span>Grid</span>
      <span className="checkin-row-time">Time</span>
      <span>Traffic</span>
    </div>
  );
}

/** Everything about where a station is, for the Location cell's tooltip. */
function locationDetails(c: Checkin): string {
  return [
    c.address && `Address: ${c.address}`,
    c.qth_location && c.qth_location !== c.address && `QTH: ${c.qth_location}`,
    c.location_lat != null && c.location_lon != null
      ? `On the map: ${formatCoords(c.location_lat, c.location_lon)}${c.location_manual ? " (placed by hand)" : ""}`
      : "Not on the map",
    c.grid_square && `Grid square: ${c.grid_square}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** A net check-in, with its traffic and whether it's been handled on the same row. */
export function NetRow({
  checkin: c,
  selected,
  onSelect,
  readOnly,
  onTrafficHandled,
}: RowProps & {
  readOnly: boolean;
  onTrafficHandled: (handled: boolean) => void;
}) {
  return (
    <div className={"checkin-row" + (selected ? " selected" : "")} onClick={onSelect}>
      <span className="checkin-row-call">{c.call_sign}</span>
      <span className="checkin-row-name">{c.name || ""}</span>
      {/* The town or address; the rest is in the tooltip (CIMAP-081). */}
      <span className="checkin-row-location" title={locationDetails(c)}>
        {c.location_lat != null && c.location_lon != null && (
          <MapPin className="checkin-row-pin" aria-label="On the map" />
        )}
        {locationText(c)}
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
                disabled={readOnly}
                onChange={(e) => onTrafficHandled(e.target.checked)}
              />
              Handled
            </label>
          </>
        )}
      </span>
    </div>
  );
}
