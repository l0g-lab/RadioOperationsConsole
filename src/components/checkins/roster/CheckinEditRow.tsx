import { useState } from "react";
import * as api from "../../../api";
import type { Activity, Checkin } from "../../../types";
import { resolveCheckinLocation } from "../../../checkinLocation";
import { isWorkingOffline } from "../../../workOffline";
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
  // One Location box, as when checking in (CIMAP-080).
  const startLocation = checkin.address || checkin.qth_location;
  const [location, setLocation] = useState(startLocation);
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
    let qth: string | null = checkin.qth_location || null;
    let grid: string | null = checkin.grid_square || null;
    let address: string | null = checkin.address || null;
    let locationLat = checkin.location_lat;
    let locationLon = checkin.location_lon;
    let locationLabel = checkin.location_label || null;
    let pinned: { lat: number; lon: number; label: string | null } | null = null;
    // A changed location is sorted again, as when checking in. A spot placed by
    // hand is never moved by it (CIMAP-003); an automatic one follows, or stays
    // put if the new text can't be placed.
    if (location.trim() !== startLocation.trim()) {
      const r = await resolveCheckinLocation(location, { online: navigator.onLine && !isWorkingOffline() });
      address = r.address;
      qth = r.qth;
      if (r.manual && r.lat != null && r.lon != null) {
        pinned = { lat: r.lat, lon: r.lon, label: r.label };
      } else if (!checkin.location_manual && r.lat != null && r.lon != null) {
        locationLat = r.lat;
        locationLon = r.lon;
        locationLabel = r.label;
      }
      grid = r.grid ?? grid;
    }

    await api.updateCheckin(
      checkin.id,
      call,
      name.trim() || null,
      qth,
      grid,
      address,
      operatorId,
      locationLat,
      locationLon,
      locationLabel,
      // Anything entered as traffic means the station has traffic.
      traffic.trim() !== "",
      traffic.trim() || null,
      log ? toContactDetails(contact) : null
    );
    // Typed coordinates or a mile marker: placed by hand.
    if (pinned) await api.setCheckinLocationCoords(checkin.id, pinned.lat, pinned.lon, pinned.label);
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
      {text(location, setLocation, "checkin-edit-location", "Location")}
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
