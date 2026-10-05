import { Fragment } from "react";
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

/** A net check-in, with its traffic shown on request. */
export function NetRow({
  checkin: c,
  selected,
  onSelect,
  trafficOpen,
  onToggleTraffic,
  readOnly,
  onTrafficHandled,
}: RowProps & {
  trafficOpen: boolean;
  onToggleTraffic: () => void;
  readOnly: boolean;
  onTrafficHandled: (handled: boolean) => void;
}) {
  return (
    <Fragment>
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
        <span className="checkin-row-traffic">
          {c.has_traffic && (
            <button
              className="link-button"
              aria-expanded={trafficOpen}
              onClick={(e) => {
                e.stopPropagation();
                onToggleTraffic();
              }}
            >
              {trafficOpen ? "Hide traffic" : "Show traffic"}
            </button>
          )}
        </span>
      </div>
      {trafficOpen && (
        <div className="report-notes-detail">
          <span className="report-notes-label">Traffic:</span>{" "}
          {c.traffic || <em>No details recorded yet.</em>}
          <label className="checkbox-row traffic-handled">
            <input
              type="checkbox"
              checked={c.traffic_handled}
              disabled={readOnly}
              onChange={(e) => onTrafficHandled(e.target.checked)}
            />
            Handled
          </label>
        </div>
      )}
    </Fragment>
  );
}
