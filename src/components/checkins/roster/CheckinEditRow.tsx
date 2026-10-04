import { useState } from "react";
import * as api from "../../../api";
import type { Activity, Checkin } from "../../../types";
import { resolveOfflineLocationAsync } from "../../../locationResolution";
import {
  contactTimeError,
  ContactFieldsInputs,
  draftFromCheckin,
  toContactDetails,
  type ContactDraft,
} from "../ContactFields";

/**
 * Correcting a net check-in (with its traffic) or a station-log contact
 * (with its radio details).
 */
export function CheckinEditRow({
  checkin,
  activity,
  operatorId,
  log,
  onSaved,
  onCancel,
}: {
  checkin: Checkin;
  activity: Activity;
  operatorId: string | null;
  /** A station log: contact details instead of traffic. */
  log: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [callSign, setCallSign] = useState(checkin.call_sign);
  const [name, setName] = useState(checkin.name);
  const [qthLocation, setQthLocation] = useState(checkin.qth_location);
  const [gridSquare, setGridSquare] = useState(checkin.grid_square);
  const [address, setAddress] = useState(checkin.address);
  const [traffic, setTraffic] = useState(checkin.traffic);
  const [contact, setContact] = useState<ContactDraft>(() => draftFromCheckin(checkin));
  const [saveRefused, setSaveRefused] = useState(false);

  async function save() {
    const call = callSign.trim();
    if (!call) return;
    if (log && contactTimeError(contact)) {
      setSaveRefused(true);
      return;
    }
    const trimmedQth = qthLocation.trim() || null;
    const trimmedGrid = gridSquare.trim() || null;
    const trimmedAddress = address.trim() || null;

    // A location placed by hand ("Edit location", typed coordinates) is
    // never moved by editing the details. An automatic one follows them: it's
    // worked out again when the QTH, grid, or address changed. If the new
    // details don't resolve, the old point is kept.
    let locationLat = checkin.location_lat;
    let locationLon = checkin.location_lon;
    let locationLabel = checkin.location_label || null;
    const detailsChanged =
      trimmedQth !== (checkin.qth_location.trim() || null) ||
      trimmedGrid !== (checkin.grid_square.trim() || null) ||
      trimmedAddress !== (checkin.address.trim() || null);
    if (locationLat == null || locationLon == null || (!checkin.location_manual && detailsChanged)) {
      const resolved = await resolveOfflineLocationAsync({
        gridSquare: trimmedGrid,
        address: trimmedAddress,
        qthLocation: trimmedQth,
      });
      if (resolved) {
        locationLat = resolved.lat;
        locationLon = resolved.lon;
        locationLabel = trimmedQth || trimmedAddress || resolved.sourceText;
      }
    }

    await api.updateCheckin(
      checkin.id,
      call,
      name.trim() || null,
      trimmedQth,
      trimmedGrid,
      trimmedAddress,
      operatorId,
      locationLat,
      locationLon,
      locationLabel,
      // Anything entered as traffic means the station has traffic.
      traffic.trim() !== "",
      traffic.trim() || null,
      log ? toContactDetails(contact) : null
    );
    onSaved();
  }

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") onCancel();
  };
  const text = (value: string, set: (v: string) => void, className: string, placeholder?: string) => (
    <input
      className={className}
      placeholder={placeholder}
      value={value}
      onChange={(e) => set(e.target.value)}
      onKeyDown={keys}
    />
  );

  return (
    <div className={"checkin-row checkin-row-editing" + (log ? " checkin-row-editing-log" : "")}>
      <input
        autoFocus
        className="checkin-edit-call"
        value={callSign}
        onChange={(e) => setCallSign(e.target.value)}
        onKeyDown={keys}
      />
      {text(name, setName, "checkin-edit-name", "Name")}
      {text(qthLocation, setQthLocation, "checkin-edit-qth", "QTH location")}
      {text(gridSquare, setGridSquare, "checkin-edit-grid", "Grid")}
      {text(address, setAddress, "checkin-edit-address", "Full address")}
      {log ? (
        <ContactFieldsInputs
          idPrefix={`checkin-edit-${checkin.id}`}
          value={contact}
          onChange={setContact}
          onEnter={save}
          frequencyPlaceholder={activity.frequency || undefined}
          saveAttempted={saveRefused}
        />
      ) : (
        text(traffic, setTraffic, "checkin-edit-traffic", "Traffic (blank if none)")
      )}
      <div className="checkin-edit-actions">
        <button onClick={save}>Save</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
