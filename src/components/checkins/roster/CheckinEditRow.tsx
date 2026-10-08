import { useState } from "react";
import * as api from "../../../api";
import type { Activity, Checkin, QrzLookupResponse } from "../../../types";
import {
  placeCheckinLater,
  resolveCheckinLocation,
  type CheckinLocation,
} from "../../../checkinLocation";
import type { MapPoint } from "../../../mapPoints";
import { lookupCallsign, sourceLabels, type CallsignSource } from "../../../callsignLookup";
import { placeText } from "../../../placeText";
import { formatContactTime, parseContactTime } from "../../../utils";
import {
  contactTimeError,
  ContactFieldsInputs,
  draftFromCheckin,
  toContactDetails,
  type ContactDraft,
} from "../ContactFields";

/** What a corrected call sign looks up as, offered in place of the old one's details. */
type Offer = { data: QrzLookupResponse; source: CallsignSource };

/** "Pat Smith, Orlando, FL", or the call sign alone when the record has neither. */
export function offerText(call: string, data: QrzLookupResponse): string {
  const who = [data.name, data.qth_location].filter(Boolean).join(", ");
  return who ? `${call.toUpperCase()} is ${who}` : `${call.toUpperCase()} is on file`;
}

/**
 * Correcting a net check-in (with its traffic) or a station-log contact
 * (with its radio details). Correcting the call sign looks the new one up and
 * offers its name and location in place of the old one's (LIFE-013). A net
 * check-in's time can be corrected too, as a contact's can.
 */
export function CheckinEditRow({
  checkin,
  activity,
  operatorId,
  log,
  qrzConfigured,
  near = null,
  onSaved,
  onCancel,
}: {
  checkin: Checkin;
  activity: Activity;
  operatorId: string | null;
  /** A station log: contact details instead of traffic. */
  log: boolean;
  qrzConfigured: boolean;
  /** Where the net is: a changed location is looked up near it once saved. */
  near?: MapPoint | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [callSign, setCallSign] = useState(checkin.call_sign);
  const [name, setName] = useState(checkin.name);
  // One Location box, as when checking in (CIMAP-080).
  const startLocation = checkin.address || checkin.qth_location;
  const [location, setLocation] = useState(startLocation);
  const [traffic, setTraffic] = useState(checkin.traffic);
  // A net check-in's time; a station log's is in its contact details.
  const startAt = formatContactTime(checkin.checked_in_at);
  const [at, setAt] = useState(startAt);
  const atParsed = parseContactTime(at);
  const atError =
    !log && atParsed.kind === "invalid"
      ? `"${at.trim()}" isn't a time. Use YYYY-MM-DD HH:MM (seconds optional), or HH:MM for today — or leave it blank to keep it.`
      : null;
  const [contact, setContact] = useState<ContactDraft>(() => draftFromCheckin(checkin));
  const [saveRefused, setSaveRefused] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [checking, setChecking] = useState(false);

  /**
   * Saves the row. `replace` answers the offer for a corrected call sign:
   * its record to use, or null to keep what's here; left out, a corrected
   * call sign is looked up first.
   */
  async function save(replace?: QrzLookupResponse | null) {
    const call = callSign.trim();
    if (!call) return;
    if ((log && contactTimeError(contact)) || atError) {
      setSaveRefused(true);
      return;
    }
    if (replace === undefined && call.toUpperCase() !== checkin.call_sign.toUpperCase()) {
      setChecking(true);
      const outcome = await lookupCallsign(call, qrzConfigured).catch(() => null);
      setChecking(false);
      if (outcome?.kind === "found") {
        setOffer({ data: outcome.data, source: outcome.source });
        return;
      }
    }
    let savedName = name.trim() || null;
    let qth: string | null = checkin.qth_location || null;
    let grid: string | null = checkin.grid_square || null;
    let address: string | null = checkin.address || null;
    let locationLat = checkin.location_lat;
    let locationLon = checkin.location_lon;
    let locationLabel = checkin.location_label || null;
    let pinned: { lat: number; lon: number; label: string | null } | null = null;
    // A changed location not placed exactly here is looked up online once saved.
    let later: CheckinLocation | null = null;
    // Or the corrected call sign's address, the same way.
    let replacedLater: { text: string; lookUp: boolean; keepGrid: boolean } | null = null;
    // A changed location is sorted again, as when checking in. A spot placed by
    // hand is never moved by it (CIMAP-003); an automatic one follows, or stays
    // put if the new text can't be placed.
    if (location.trim() !== startLocation.trim()) {
      const r = await resolveCheckinLocation(location, { near });
      later = checkin.location_manual ? null : r;
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
    } else if (replace) {
      // The old call sign's details make way for the new one's; a spot placed
      // by hand stays (CIMAP-003), and anything changed in this edit is kept.
      qth = replace.qth_location;
      grid = replace.grid_square;
      address = replace.address;
      if (!checkin.location_manual) {
        const text = address || qth || "";
        const p = await placeText(text, {
          station: {
            qth,
            grid,
            exact: replace.exact_lat != null && replace.exact_lon != null ? { lat: replace.exact_lat, lon: replace.exact_lon } : null,
          },
          near,
          online: "later",
        });
        locationLat = p.lat;
        locationLon = p.lon;
        locationLabel = p.lat != null ? qth || address || p.label : null;
        replacedLater = { text, lookUp: p.lookUp, keepGrid: !!grid };
      }
    }
    if (replace && name.trim() === checkin.name.trim()) savedName = replace.name || null;

    await api.updateCheckin(
      checkin.id,
      call,
      savedName,
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
      log ? toContactDetails(contact) : null,
      !log && at.trim() !== startAt && atParsed.kind === "ok" ? atParsed.iso : null
    );
    // Typed coordinates or a mile marker: placed by hand.
    if (pinned) await api.setCheckinLocationCoords(checkin.id, pinned.lat, pinned.lon, pinned.label);
    else if (later) placeCheckinLater(checkin.id, location, later, near);
    else if (replacedLater) placeCheckinLater(checkin.id, replacedLater.text, replacedLater, near);
    onSaved();
  }

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save(offer ? offer.data : undefined);
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
        onChange={(e) => {
          setCallSign(e.target.value);
          setOffer(null);
        }}
        onKeyDown={keys}
      />
      {text(name, setName, "checkin-edit-name", "Name")}
      {text(location, setLocation, "checkin-edit-location", "Location")}
      {log ? (
        <ContactFieldsInputs
          idPrefix={`checkin-edit-${checkin.id}`}
          value={contact}
          onChange={setContact}
          onEnter={() => save()}
          frequencyPlaceholder={activity.frequency || undefined}
          saveAttempted={saveRefused}
        />
      ) : (
        <>
          {text(traffic, setTraffic, "checkin-edit-traffic", "Traffic (blank if none)")}
          <input
            className="checkin-edit-time"
            aria-label="Check-in time"
            placeholder="YYYY-MM-DD HH:MM"
            title="When the station checked in, in this computer's time: YYYY-MM-DD HH:MM, seconds optional."
            aria-invalid={saveRefused && atError != null}
            value={at}
            onChange={(e) => setAt(e.target.value)}
            onKeyDown={keys}
          />
        </>
      )}
      <div className="checkin-edit-actions">
        <button onClick={() => save()} disabled={checking || offer !== null}>
          {checking ? "Looking up…" : "Save"}
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
      {saveRefused && atError && (
        <p className="weather-area-error contact-time-error" role="alert">
          {atError}
        </p>
      )}
      {offer && (
        <div className="inline-form confirm-row checkin-edit-offer" role="status">
          <span>
            {offerText(callSign, offer.data)} ({sourceLabels(offer.source).found}). Use this name and location
            instead?
          </span>
          <button className="primary" onClick={() => save(offer.data)}>
            Replace
          </button>
          <button onClick={() => save(null)}>Keep mine</button>
        </div>
      )}
    </div>
  );
}
