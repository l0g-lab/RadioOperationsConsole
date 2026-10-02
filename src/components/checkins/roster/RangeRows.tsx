import { useState } from "react";
import * as api from "../../../api";
import type { Checkin } from "../../../types";
import { formatCoords } from "../../../geo";
import {
  missingMessage,
  missingRangeFields,
  rangeDraftFromCheckin,
  stationKindLabel,
  toRangeContact,
  type RangeDraft,
} from "../../../rangeCheck";
import { RangeReportFields } from "../RangeReportFields";
import { ClipCell, DistanceCell, DistanceHeading, TimeCell, type Place, type RowProps } from "./shared";

/** A range check's column headings (RANGE-020). */
export function RangeColumns({ distanceFrom }: { distanceFrom: Place | null }) {
  return (
    <div className="checkin-row checkin-row-range checkin-row-columns">
      <span>Call Sign</span>
      <span>Name</span>
      <span>Cross Street</span>
      <DistanceHeading
        from={distanceFrom}
        howToSet="Set the repeater (Operations tab) to see distances"
      />
      <span>Station</span>
      <span>Antenna</span>
      <span>Power</span>
      <span title="How net control hears the station">We Hear Them</span>
      <span title="How the station hears the repeater">They Hear Rptr</span>
      <span>Notes</span>
      <span className="checkin-row-time">Time</span>
    </div>
  );
}

/** A range-check report. */
export function RangeRow({
  checkin: c,
  selected,
  onSelect,
  distanceFrom,
}: RowProps & { distanceFrom: Place | null }) {
  return (
    <div className={"checkin-row checkin-row-range" + (selected ? " selected" : "")} onClick={onSelect}>
      <span className="checkin-row-call">{c.call_sign}</span>
      <span className="checkin-row-name">{c.name}</span>
      <span
        className="checkin-row-clip"
        title={
          c.location_lat != null && c.location_lon != null
            ? `${c.cross_street} — ${formatCoords(c.location_lat, c.location_lon)}`
            : c.cross_street || undefined
        }
      >
        {c.cross_street}
      </span>
      <DistanceCell checkin={c} from={distanceFrom} />
      <span>{c.station_kind ? stationKindLabel(c.station_kind) : ""}</span>
      <ClipCell text={c.antenna} />
      <ClipCell text={c.power} />
      <ClipCell text={c.rst_sent} />
      <ClipCell text={c.rst_received} />
      <ClipCell text={c.notes} />
      <TimeCell at={c.checked_in_at} />
    </div>
  );
}

/**
 * Correcting a range-check report: the same rules as a new one (RANGE-017),
 * with the point moved on the map within the row.
 */
export function RangeEditRow({
  checkin,
  operatorId,
  repeater,
  onSaved,
  onCancel,
}: {
  checkin: Checkin;
  operatorId: string | null;
  /** Where the map opens when the station has no point yet. */
  repeater: Place | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [callSign, setCallSign] = useState(checkin.call_sign);
  const [name, setName] = useState(checkin.name);
  const [range, setRange] = useState<RangeDraft>(() => rangeDraftFromCheckin(checkin));
  const [saveRefused, setSaveRefused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = saveRefused ? missingRangeFields(range) : [];

  async function save() {
    const call = callSign.trim();
    if (!call) return;
    if (missingRangeFields(range).length > 0) {
      setSaveRefused(true);
      return;
    }
    try {
      await api.updateCheckin(
        checkin.id,
        call,
        name.trim() || null,
        checkin.qth_location || null,
        checkin.grid_square || null,
        checkin.address || null,
        operatorId,
        range.lat,
        range.lon,
        range.crossStreet.trim(),
        false,
        null,
        toRangeContact(range)
      );
    } catch (e) {
      setError(String(e));
      return;
    }
    onSaved();
  }

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") onCancel();
  };
  return (
    <div className="checkin-row checkin-row-editing checkin-row-editing-log">
      <input
        autoFocus
        aria-label="Call sign"
        className="checkin-edit-call"
        value={callSign}
        onChange={(e) => setCallSign(e.target.value)}
        onKeyDown={keys}
      />
      <input
        aria-label="Name"
        className="checkin-edit-name"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={keys}
      />
      <RangeReportFields
        value={range}
        onChange={setRange}
        onEnter={save}
        invalid={missing}
        repeater={repeater}
        callSign={callSign}
      />
      {(missing.length > 0 || error) && (
        <p className="weather-area-error contact-time-error" role="alert">
          {missing.length > 0 ? missingMessage(missing) : error}
        </p>
      )}
      <div className="checkin-edit-actions">
        <button onClick={save}>Save</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
