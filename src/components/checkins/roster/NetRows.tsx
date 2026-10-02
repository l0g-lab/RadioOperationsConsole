import { Fragment } from "react";
import { formatCoords } from "../../../geo";
import { TimeCell, type RowProps } from "./shared";

/** A net's column headings. */
export function NetColumns() {
  return (
    <div className="checkin-row checkin-row-columns">
      <span>Call Sign</span>
      <span>Name</span>
      <span>Location</span>
      <span>Grid Square</span>
      <span>Coordinates</span>
      <span>Address</span>
      <span className="checkin-row-time">Time</span>
      <span>Traffic</span>
    </div>
  );
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
        <span className="checkin-row-location">{c.qth_location}</span>
        <span className="checkin-row-grid">{c.grid_square}</span>
        <span className="checkin-row-coords" title={c.location_label || undefined}>
          {c.location_lat != null && c.location_lon != null
            ? formatCoords(c.location_lat, c.location_lon)
            : ""}
        </span>
        <span className="checkin-row-address" title={c.address || undefined}>
          {c.address}
        </span>
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
