import { Fragment } from "react";
import { formatCoords } from "../../../geo";
import { rstPair } from "../ContactFields";
import { ClipCell, DistanceCell, DistanceHeading, TimeCell, type Place, type RowProps } from "./shared";
import { locationText } from "../../../checkinLocation";
import { MapPin } from "lucide-react";

/** A station log's column headings (LOG-020). */
export function LogColumns({ distanceFrom }: { distanceFrom: Place | null }) {
  return (
    <div className="checkin-row checkin-row-log checkin-row-columns">
      <span>Call Sign</span>
      <span>Name</span>
      <span>Location</span>
      <DistanceHeading
        from={distanceFrom}
        howToSet="Set a location on this log (Operations tab) or on your operator to see distances"
      />
      <span>Frequency</span>
      <span>Mode</span>
      <span className="checkin-row-nowrap" title="Signal report sent / received">
        RST S / R
      </span>
      <span>Power</span>
      <span>Antenna</span>
      <span>Notes</span>
      <span className="checkin-row-time">Time</span>
      <span>Details</span>
    </div>
  );
}

/** A station-log contact, with the rest of its details shown on request. */
export function LogRow({
  checkin: c,
  selected,
  onSelect,
  distanceFrom,
  detailsOpen,
  onToggleDetails,
}: RowProps & {
  distanceFrom: Place | null;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  const coords =
    c.location_lat != null && c.location_lon != null
      ? formatCoords(c.location_lat, c.location_lon)
      : "";
  // Power, antenna and notes have columns; the rest (and notes in full) are here.
  const details: [string, string][] = (
    [
      ["Grid", c.grid_square],
      ["Address", c.address],
      ["Coordinates", coords],
      ["Notes", c.notes],
      ["Traffic", c.has_traffic ? c.traffic || "yes" : ""],
    ] as [string, string][]
  ).filter(([, v]) => v);
  return (
    <Fragment>
      <div className={"checkin-row checkin-row-log" + (selected ? " selected" : "")} onClick={onSelect}>
        <span className="checkin-row-call">{c.call_sign}</span>
        <span className="checkin-row-name">{c.name}</span>
        <span className="checkin-row-location" title={c.address || c.qth_location || undefined}>
          {c.location_lat != null && c.location_lon != null && (
            <MapPin className="checkin-row-pin" aria-label="On the map" />
          )}
          {locationText(c)}
        </span>
        <DistanceCell checkin={c} from={distanceFrom} />
        <span className="checkin-row-mono">{c.frequency}</span>
        <span>{c.mode}</span>
        <span className="checkin-row-mono checkin-row-nowrap">{rstPair(c)}</span>
        <ClipCell text={c.power} />
        <ClipCell text={c.antenna} />
        <ClipCell text={c.notes} />
        <TimeCell at={c.checked_in_at} />
        <span>
          {details.length > 0 && (
            <button
              className="link-button"
              aria-expanded={detailsOpen}
              onClick={(e) => {
                e.stopPropagation();
                onToggleDetails();
              }}
            >
              {detailsOpen ? "Hide details" : "Show details"}
            </button>
          )}
        </span>
      </div>
      {detailsOpen && (
        <div className="report-notes-detail contact-details">
          {details.map(([label, value]) => (
            <span key={label}>
              <span className="report-notes-label">{label}:</span> {value}
            </span>
          ))}
        </div>
      )}
    </Fragment>
  );
}
