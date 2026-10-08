import { useEffect, useRef, useState } from "react";
import * as api from "../../api";
import { QRZ_ERR_NOT_CONFIGURED, ERR_OFFLINE } from "../../types";
import {
  callSignService,
  GMRS_FILE_MISSING,
  lookupCallsign,
  sourceLabels,
  type CallsignSource,
} from "../../callsignLookup";
import {
  placeCheckinLater,
  resolveCheckinLocation,
  type CheckinLocation,
  type LookupLocation,
} from "../../checkinLocation";
import type { MapPoint } from "../../mapPoints";
import { hintWidth } from "../hintWidth";
import LocationPicker from "../LocationPicker";
import { MapPin } from "lucide-react";
import {
  contactTimeError,
  ContactFieldsInputs,
  EMPTY_CONTACT,
  nextContact,
  toContactDetails,
  useStationHistory,
  WorkedBefore,
  type ContactDraft,
} from "./ContactFields";
import { RangeReportFields } from "./RangeReportFields";
import {
  EMPTY_RANGE,
  missingMessage,
  missingRangeFields,
  toRangeContact,
  type RangeDraft,
} from "../../rangeCheck";

interface Props {
  activityId: string;
  operatorId: string | null;
  qrzConfigured: boolean;
  /** The offline FCC call-sign directory is downloaded (used only when QRZ isn't available). */
  offlineCallsAvailable: boolean;
  rapidEntryMode: boolean;
  focusCallSignSignal: number;
  onSaved: (checkinId: string) => void;
  /** A station log: records are contacts with radio details, and there's no traffic. */
  log?: boolean;
  /** The activity's frequency, suggested when a contact's is left blank. */
  activityFrequency?: string;
  /**
   * A range check: each check-in needs a cross street, a point picked on the
   * map, station type, power and both signal reports (RANGE-010–016).
   */
  rangeCheck?: boolean;
  /** The repeater's location, where the range check's map opens. */
  repeater?: { lat: number; lon: number } | null;
  /** Where the net is (its repeater, else net control): typed places are looked up near it. */
  near?: MapPoint | null;
  /** Net control's call sign: a note with no call sign is logged from it (NETOPS-060). */
  netControlCall?: string;
}

type QrzStatus = "idle" | "loading" | "found" | "not_found" | "missing_file" | "error";

/** Input hints, each shown in full (the inputs are sized to fit them). */
const HINTS = {
  call: "Call sign, then Enter",
  name: "Name (optional, auto-filled by lookup)",
  location: "Location — address, cross street, MM 182 turnpike, or lat, lon",
  traffic: "Traffic — what they have to pass (blank if none)",
};

// Long enough that a pause mid-call ("KR4H…GY") doesn't look up the partial
// call, short enough that the result is there by the time the name is needed.
const QRZ_LOOKUP_DEBOUNCE_MS = 800;
const QRZ_LOOKUP_MIN_LENGTH = 3;

/** The rapid check-in entry row: call sign/name/QTH/grid/address plus type-as-you-go QRZ lookup. */
export default function CheckinEntryForm({
  activityId,
  operatorId,
  qrzConfigured,
  offlineCallsAvailable,
  rapidEntryMode,
  focusCallSignSignal,
  onSaved,
  log = false,
  activityFrequency = "",
  rangeCheck = false,
  repeater = null,
  near = null,
  netControlCall = "",
}: Props) {
  const [callSign, setCallSign] = useState("");
  const [name, setName] = useState("");
  // One Location box (CIMAP-080): typed, or filled by the lookup; sorted into
  // address, QTH, grid square, and map position when saved (checkinLocation.ts).
  const [location, setLocation] = useState("");
  // What the call-sign lookup found, kept until saving.
  const [lookupLoc, setLookupLoc] = useState<LookupLocation | null>(null);
  // A spot picked on the map, which wins over everything else.
  const [pin, setPin] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  // Where it will land, shown under the box; offline sources only while typing.
  const [preview, setPreview] = useState<CheckinLocation | null>(null);
  const [traffic, setTraffic] = useState("");
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT);
  const [contactSaveRefused, setContactSaveRefused] = useState(false);
  const [range, setRange] = useState<RangeDraft>(EMPTY_RANGE);
  // Once a save is refused, the missing fields stay marked until filled in.
  const [rangeSaveRefused, setRangeSaveRefused] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const rangeMissing = rangeCheck && rangeSaveRefused ? missingRangeFields(range) : [];
  const history = useStationHistory(callSign);
  const [qrzStatus, setQrzStatus] = useState<QrzStatus>("idle");
  const [lookupSource, setLookupSource] = useState<CallsignSource>("qrz");
  const [fileLacksStreet, setFileLacksStreet] = useState(false);
  const callSignRef = useRef<HTMLInputElement>(null);
  const qrzRequestedForRef = useRef<string | null>(null);
  // What the last lookup filled in, and for which call sign. When the call
  // sign changes (typing went on after a pause: "KR4H" → "KR4HGY"), those
  // values belong to another station; any the operator hasn't edited are
  // cleared so the new call is looked up (QRZ-037).
  const autoFilledRef = useRef<{
    call: string;
    name: string | null;
    location: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      resolveCheckinLocation(location, { lookup: lookupLoc, pin, near }).then((r) => {
        if (!cancelled) setPreview(r.note ? r : null);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [location, lookupLoc, pin]);

  useEffect(() => {
    if (focusCallSignSignal > 0) callSignRef.current?.focus();
  }, [focusCallSignSignal]);

  // Fire an async, non-blocking QRZ lookup after a short pause in typing.
  // Saving a check-in never waits on this; a stale response (for a call
  // sign that no longer matches the field, e.g. after save resets it) is
  // discarded rather than overwriting a later entry's Name field.
  useEffect(() => {
    const call = callSign.trim().toUpperCase();
    if (call === "") {
      // Clearing the call sign clears whatever was populated for it too —
      // there's no longer a station this data is attached to.
      setName("");
      setLocation("");
      setLookupLoc(null);
      setPin(null);
      setQrzStatus("idle");
      qrzRequestedForRef.current = null;
      autoFilledRef.current = null;
      return;
    }
    // Values on screen as of this call sign, after dropping any that were
    // filled for a different one.
    let current = { name, location };
    const filled = autoFilledRef.current;
    if (filled && filled.call !== call) {
      autoFilledRef.current = null;
      const keep = (value: string, auto: string | null) =>
        auto !== null && value === auto ? "" : value;
      current = {
        name: keep(name, filled.name),
        location: keep(location, filled.location),
      };
      setName(current.name);
      setLocation(current.location);
      setLookupLoc(null);
      setQrzStatus("idle");
    }
    if (
      // A GMRS call sign is always looked up, so a missing GMRS file can be pointed out.
      !(qrzConfigured || offlineCallsAvailable || callSignService(call) === "gmrs") ||
      current.name.trim() ||
      call.length < QRZ_LOOKUP_MIN_LENGTH
    ) {
      setQrzStatus("idle");
      return;
    }
    const timer = setTimeout(() => {
      qrzRequestedForRef.current = call;
      setQrzStatus("loading");
      // GMRS: the GMRS file. Otherwise QRZ first, the amateur file only when
      // QRZ isn't available.
      lookupCallsign(call, qrzConfigured).then((outcome) => {
        if (qrzRequestedForRef.current !== call || callSign.trim().toUpperCase() !== call) {
          return;
        }
        if (outcome.kind === "found") {
          const result = outcome.data;
          setLookupSource(outcome.source);
          setFileLacksStreet(Boolean(outcome.fileLacksStreet));
          setQrzStatus("found");
          // Only blank fields are filled; remember just those, so a field the
          // operator typed is never mistaken for a lookup's and cleared.
          const fill = (value: string, found: string | null) =>
            !value.trim() && found ? found : null;
          // The box shows the full address, else the town; the rest is kept for saving.
          const found = result.address || result.qth_location;
          const auto = {
            call,
            name: fill(current.name, result.name),
            location: fill(current.location, found),
          };
          autoFilledRef.current = auto;
          if (auto.name !== null) setName(auto.name);
          if (auto.location !== null) setLocation(auto.location);
          setLookupLoc({
            text: auto.location ?? current.location,
            qth: result.qth_location,
            grid: result.grid_square,
            exact:
              result.exact_lat != null && result.exact_lon != null
                ? { lat: result.exact_lat, lon: result.exact_lon }
                : null,
          });
        } else if (outcome.kind === "not_found") {
          setLookupSource(outcome.source);
          setQrzStatus("not_found");
        } else if (outcome.kind === "missing_file") {
          setQrzStatus("missing_file");
        } else {
          // No network, or QRZ isn't configured (and no offline directory):
          // an expected, uninteresting state — the app works fully offline —
          // so stay silent rather than showing an "error" (QRZ-003, QRZ-030).
          setQrzStatus(
            outcome.error === ERR_OFFLINE || outcome.error === QRZ_ERR_NOT_CONFIGURED
              ? "idle"
              : "error"
          );
        }
      });
    }, QRZ_LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callSign, qrzConfigured, offlineCallsAvailable]);

  function clearQrzData() {
    setName("");
    setLocation("");
    setLookupLoc(null);
    setPin(null);
    setQrzStatus("idle");
    qrzRequestedForRef.current = null;
    autoFilledRef.current = null;
  }

  // On a net, traffic with no call sign is a note from net control (NETOPS-060).
  const noteFromNetControl = !log && !rangeCheck && !callSign.trim() && !!traffic.trim();
  const ncsCall = netControlCall.trim().toUpperCase() || "NET CONTROL";

  /**
   * Logs a note from net control: a line of its own on the roster and the
   * ICS 309, at the time it's saved, that isn't a check-in, a station, or
   * traffic to pass (NETOPS-060).
   */
  async function saveNetControlNote() {
    const id = await api.createCheckin(
      activityId,
      ncsCall,
      null,
      null,
      null,
      null,
      operatorId,
      null,
      null,
      null,
      false,
      traffic.trim(),
      { station_kind: "net_control" }
    );
    setTraffic("");
    onSaved(id);
    if (rapidEntryMode) callSignRef.current?.focus();
  }

  async function handleSaveCheckin() {
    const call = callSign.trim();
    if (!call) {
      if (noteFromNetControl) await saveNetControlNote();
      return;
    }
    if (rangeCheck) return saveRangeReport(call);
    if (log && contactTimeError(contact)) {
      setContactSaveRefused(true);
      return;
    }
    setContactSaveRefused(false);
    // Sorted into address, QTH, grid square and map position (CIMAP-080);
    // what can't be placed exactly offline is looked up online once saved.
    const loc = await resolveCheckinLocation(location, {
      lookup: lookupLoc,
      pin,
      near,
    });
    const id = await api.createCheckin(
      activityId,
      call,
      name.trim() || null,
      loc.qth,
      loc.grid,
      loc.address,
      operatorId,
      loc.lat,
      loc.lon,
      loc.label,
      // Anything entered as traffic means the station has traffic.
      traffic.trim() !== "",
      traffic.trim() || null,
      log ? toContactDetails(contact) : null,
      // Picked on the map, typed coordinates, or a mile marker.
      loc.manual,
      loc.how
    );
    placeCheckinLater(id, location, loc, near);
    // The station setup carries over to the next contact.
    setContact(nextContact(contact));
    setTraffic("");
    setCallSign("");
    setName("");
    setLocation("");
    setLookupLoc(null);
    setPin(null);
    setQrzStatus("idle");
    qrzRequestedForRef.current = null;
    onSaved(id);
    if (rapidEntryMode) callSignRef.current?.focus();
  }

  // A range check's point comes only from the map, never from the lookup,
  // address or coordinates box (RANGE-014, RANGE-015).
  async function saveRangeReport(call: string) {
    if (missingRangeFields(range).length > 0) {
      setRangeSaveRefused(true);
      return;
    }
    setSaveError(null);
    let id: string;
    try {
      id = await api.createCheckin(
        activityId,
        call,
        name.trim() || null,
        null,
        null,
        null,
        operatorId,
        range.lat,
        range.lon,
        range.crossStreet.trim(),
        false,
        null,
        toRangeContact(range)
      );
    } catch (e) {
      setSaveError(String(e));
      return;
    }
    // Every station is different: nothing carries over (RANGE-016).
    setRange(EMPTY_RANGE);
    setRangeSaveRefused(false);
    setCallSign("");
    setName("");
    setQrzStatus("idle");
    qrzRequestedForRef.current = null;
    onSaved(id);
    if (rapidEntryMode) callSignRef.current?.focus();
  }

  return (
    <div className="checkin-entry">
      {/* Each caption sits with its box, so they stay together when the row wraps. */}
      <div className="checkin-entry-row checkin-entry-row-main">
        <div
          className="checkin-entry-field checkin-entry-field-call"
          style={hintWidth(HINTS.call, { uppercase: true })}
        >
          <label htmlFor="checkin-callsign">Call sign</label>
          <input
            id="checkin-callsign"
            ref={callSignRef}
            autoFocus
            className="checkin-entry-call"
            placeholder={HINTS.call}
            value={callSign}
            onChange={(e) => setCallSign(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveCheckin();
            }}
          />
        </div>
        <div
          className="checkin-entry-field checkin-entry-field-name"
          style={hintWidth(HINTS.name)}
        >
          <label htmlFor="checkin-name">
            Name{" "}
            {qrzStatus === "loading" && (
              <span className="qrz-status qrz-status-loading">looking up…</span>
            )}
            {qrzStatus === "found" && (
              <span className="qrz-status qrz-status-found">{sourceLabels(lookupSource).found}</span>
            )}
            {qrzStatus === "not_found" && (
              <span className="qrz-status qrz-status-muted">
                {sourceLabels(lookupSource).notFound}
              </span>
            )}
            {qrzStatus === "missing_file" && (
              <span className="qrz-status qrz-status-muted">{GMRS_FILE_MISSING}</span>
            )}
            {qrzStatus === "error" && (
              <span className="qrz-status qrz-status-muted">QRZ lookup failed</span>
            )}
          </label>
          <input
            id="checkin-name"
            className="checkin-entry-name"
            placeholder={HINTS.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveCheckin();
            }}
          />
        </div>
        <button onClick={handleSaveCheckin}>
          {log ? "Save contact" : noteFromNetControl ? "Save note" : "Save check-in"}
        </button>
      </div>
      {!rangeCheck && (
        <div className="checkin-entry-row checkin-entry-row-secondary">
          <input
            className="checkin-entry-location"
            aria-label="Location"
            placeholder={HINTS.location}
            title="An address, town or ZIP, a cross street, a mile marker (MM 182 turnpike), a grid square, or GPS coordinates. A call-sign lookup fills it in."
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              // A typed location replaces a spot picked for the old one.
              setPin(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveCheckin();
            }}
          />
          <button type="button" onClick={() => setShowPicker(true)} title="Pick the exact spot on a map">
            <MapPin className="button-icon" /> Map
          </button>
          <button
            type="button"
            className="link-button checkin-entry-clear"
            onClick={clearQrzData}
            disabled={!name && !location && !pin}
          >
            Clear
          </button>
        </div>
      )}
      {!rangeCheck && preview && (
        <p className={"settings-hint checkin-entry-hint" + (preview.lat == null ? " checkin-location-unplaced" : "")}>
          Map:{" "}
          {preview.note}
          {preview.grid ? ` · grid ${preview.grid}` : ""}
        </p>
      )}
      {rangeCheck && (
        <RangeReportFields
          value={range}
          onChange={setRange}
          onEnter={handleSaveCheckin}
          invalid={rangeMissing}
          repeater={repeater}
          callSign={callSign}
        />
      )}
      {rangeMissing.length > 0 && (
        <p className="weather-area-error checkin-entry-hint" role="alert">
          {missingMessage(rangeMissing)}
        </p>
      )}
      {saveError && (
        <p className="weather-area-error checkin-entry-hint" role="alert">
          {saveError}
        </p>
      )}
      {log && (
        <ContactFieldsInputs
          idPrefix="checkin-entry"
          value={contact}
          onChange={setContact}
          onEnter={handleSaveCheckin}
          frequencyPlaceholder={activityFrequency || undefined}
          saveAttempted={contactSaveRefused}
          liveTime
        />
      )}
      <WorkedBefore history={history} label={log ? "Worked before" : "Checked in before"} />
      {!log && !rangeCheck && (
        <div className="checkin-entry-row checkin-entry-row-traffic">
          <input
            className="checkin-entry-traffic"
            aria-label="Traffic"
            placeholder={HINTS.traffic}
            style={hintWidth(HINTS.traffic)}
            value={traffic}
            onChange={(e) => setTraffic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveCheckin();
            }}
            title="What the station has to pass. With no call sign, a note from net control for the log."
          />
          {noteFromNetControl && (
            <span className="settings-hint checkin-entry-note-hint" role="status">
              No call sign: saving logs this as a note from net control ({ncsCall}).
            </span>
          )}
        </div>
      )}
      {qrzStatus === "found" && lookupSource !== "qrz" && fileLacksStreet && (
        <p className="settings-hint checkin-entry-hint">
          Street address not filled in: the call-sign file on this computer was downloaded before
          street addresses were included. Update it in Settings → Offline Data.
        </p>
      )}
      {showPicker && (
        <LocationPicker
          title={`Location — ${callSign.trim().toUpperCase() || "new check-in"}`}
          near={near}
          initialLat={pin?.lat ?? preview?.lat ?? null}
          initialLon={pin?.lon ?? preview?.lon ?? null}
          initialLabel={pin?.label ?? location}
          onSave={(lat, lon, label) => {
            setPin({ lat, lon, label });
            if (!location.trim() && label) setLocation(label);
            setShowPicker(false);
          }}
          onClear={
            pin
              ? () => {
                  setPin(null);
                  setShowPicker(false);
                }
              : undefined
          }
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
