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
import { resolveOfflineLocationAsync } from "../../locationResolution";
import { formatCoords, parseCoords } from "../../geo";
import { hintWidth } from "../hintWidth";
import type { MileMarkerHit } from "../../types";
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
}

type QrzStatus = "idle" | "loading" | "found" | "not_found" | "missing_file" | "error";

/** Input hints, each shown in full (the inputs are sized to fit them). */
const HINTS = {
  call: "Call sign, then Enter",
  name: "Name (optional, auto-filled by lookup)",
  qth: "QTH location (optional, auto-filled from QRZ)",
  grid: "Grid square",
  address: "Full address (optional, auto-filled from QRZ)",
  coords: "Coordinates, or e.g. MM 182 turnpike",
  traffic: "Traffic — what they have to pass (optional, can be added later)",
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
}: Props) {
  const [callSign, setCallSign] = useState("");
  const [name, setName] = useState("");
  const [qthLocation, setQthLocation] = useState("");
  const [gridSquare, setGridSquare] = useState("");
  const [address, setAddress] = useState("");
  const [hasTraffic, setHasTraffic] = useState(false);
  const [traffic, setTraffic] = useState("");
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT);
  const [contactSaveRefused, setContactSaveRefused] = useState(false);
  const history = useStationHistory(callSign);
  // QRZ's exact point for the call sign currently being entered — held here
  // (not in a visible field) until the check-in is saved.
  const [qrzExact, setQrzExact] = useState<{ lat: number; lon: number } | null>(null);
  // Shown as "lat, lon". Auto-populates from whatever the location resolves
  // to (QRZ's exact point, else ZIP/grid) but can be typed over — once
  // edited by hand it stops auto-updating and wins at save time.
  const [coordsText, setCoordsText] = useState("");
  const coordsEditedRef = useRef(false);
  // Where the auto-filled point came from, shown under the row so the field
  // isn't a mystery ("center of ZIP 33157", "QRZ's exact point", ...).
  const [coordsNote, setCoordsNote] = useState<string | null>(null);
  // Anything typed in that box that isn't coordinates is tried as a
  // mile-marker reference ("mm 182 turnpike") against the offline road data,
  // so a mobile station's "mile marker 182" can be entered as they say it.
  const [phrase, setPhrase] = useState<
    { status: "idle" } | { status: "hit"; hit: MileMarkerHit } | { status: "miss" }
  >({ status: "idle" });
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
    qth: string | null;
    grid: string | null;
    address: string | null;
  } | null>(null);

  useEffect(() => {
    if (coordsEditedRef.current) return;
    let cancelled = false;
    resolveOfflineLocationAsync({
      qrzLat: qrzExact?.lat,
      qrzLon: qrzExact?.lon,
      gridSquare: gridSquare.trim() || null,
      address: address.trim() || null,
      qthLocation: qthLocation.trim() || null,
    }).then((r) => {
      if (!cancelled && !coordsEditedRef.current) {
        setCoordsText(r ? formatCoords(r.lat, r.lon) : "");
        setCoordsNote(
          !r
            ? null
            : r.source === "qrz_exact"
              ? "QRZ's exact point for this station"
              : r.source === "zip_centroid"
                ? `the center of ZIP ${r.sourceText} — approximate, not the street address`
                : r.source === "grid_square"
                  ? `the center of grid square ${r.sourceText} — approximate`
                  : null
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [qrzExact, gridSquare, address, qthLocation]);

  function resetCoords() {
    coordsEditedRef.current = false;
    setCoordsText("");
    setCoordsNote(null);
    setPhrase({ status: "idle" });
  }

  useEffect(() => {
    const text = coordsText.trim();
    if (!text || parseCoords(text)) {
      setPhrase({ status: "idle" });
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .resolveMileMarker(text)
        .then((hit) => {
          if (!cancelled) setPhrase(hit ? { status: "hit", hit } : { status: "miss" });
        })
        .catch(() => {
          if (!cancelled) setPhrase({ status: "miss" });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [coordsText]);

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
      setQthLocation("");
      setGridSquare("");
      setAddress("");
      setQrzExact(null);
      resetCoords();
      setQrzStatus("idle");
      qrzRequestedForRef.current = null;
      autoFilledRef.current = null;
      return;
    }
    // Values on screen as of this call sign, after dropping any that were
    // filled for a different one.
    let current = { name, qth: qthLocation, grid: gridSquare, address };
    const filled = autoFilledRef.current;
    if (filled && filled.call !== call) {
      autoFilledRef.current = null;
      const keep = (value: string, auto: string | null) =>
        auto !== null && value === auto ? "" : value;
      current = {
        name: keep(name, filled.name),
        qth: keep(qthLocation, filled.qth),
        grid: keep(gridSquare, filled.grid),
        address: keep(address, filled.address),
      };
      setName(current.name);
      setQthLocation(current.qth);
      setGridSquare(current.grid);
      setAddress(current.address);
      setQrzExact(null);
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
          const auto = {
            call,
            name: fill(current.name, result.name),
            qth: fill(current.qth, result.qth_location),
            grid: fill(current.grid, result.grid_square),
            address: fill(current.address, result.address),
          };
          autoFilledRef.current = auto;
          if (auto.name !== null) setName(auto.name);
          if (auto.qth !== null) setQthLocation(auto.qth);
          if (auto.grid !== null) setGridSquare(auto.grid);
          if (auto.address !== null) setAddress(auto.address);
          if (result.exact_lat != null && result.exact_lon != null) {
            setQrzExact({ lat: result.exact_lat, lon: result.exact_lon });
          }
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
    setQthLocation("");
    setGridSquare("");
    setAddress("");
    setQrzExact(null);
    resetCoords();
    setQrzStatus("idle");
    qrzRequestedForRef.current = null;
    autoFilledRef.current = null;
  }

  async function handleSaveCheckin() {
    const call = callSign.trim();
    if (!call) return;
    if (log && contactTimeError(contact)) {
      setContactSaveRefused(true);
      return;
    }
    setContactSaveRefused(false);
    const trimmedQth = qthLocation.trim() || null;
    const trimmedGrid = gridSquare.trim() || null;
    const trimmedAddress = address.trim() || null;
    // Offline-first (QRZ's exact point, then ZIP centroid, then grid square — locationResolution.ts)
    // so a check-in gets a real, storable position the moment enough QRZ
    // directory data is on hand, without waiting on/requiring the network.
    // Hand-typed (or auto-shown) coordinates win; malformed text is ignored
    // and the normal resolution order applies.
    let typed = parseCoords(coordsText);
    let reportedLabel: string | null = null;
    if (!typed && coordsText.trim()) {
      const hit = await api.resolveMileMarker(coordsText.trim()).catch(() => null);
      if (hit) {
        typed = { lat: hit.lat, lon: hit.lon };
        reportedLabel = hit.label;
      }
    }
    const resolved = await resolveOfflineLocationAsync({
      lat: typed?.lat,
      lon: typed?.lon,
      qrzLat: qrzExact?.lat,
      qrzLon: qrzExact?.lon,
      gridSquare: trimmedGrid,
      address: trimmedAddress,
      qthLocation: trimmedQth,
    });
    const id = await api.createCheckin(
      activityId,
      call,
      name.trim() || null,
      trimmedQth,
      trimmedGrid,
      trimmedAddress,
      operatorId,
      resolved?.lat ?? null,
      resolved?.lon ?? null,
      reportedLabel || trimmedQth || trimmedAddress || resolved?.sourceText || null,
      hasTraffic,
      hasTraffic ? traffic.trim() || null : null,
      log ? toContactDetails(contact) : null
    );
    // The station setup carries over to the next contact.
    setContact(nextContact(contact));
    setHasTraffic(false);
    setTraffic("");
    setCallSign("");
    setName("");
    setQthLocation("");
    setGridSquare("");
    setAddress("");
    setQrzExact(null);
    resetCoords();
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
        <button onClick={handleSaveCheckin}>{log ? "Save contact" : "Save check-in"}</button>
      </div>
      <div className="checkin-entry-row checkin-entry-row-secondary">
        <input
          className="checkin-entry-qth"
          placeholder={HINTS.qth}
          style={hintWidth(HINTS.qth)}
          value={qthLocation}
          onChange={(e) => setQthLocation(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveCheckin();
          }}
        />
        <input
          className="checkin-entry-grid"
          placeholder={HINTS.grid}
          style={hintWidth(HINTS.grid, { uppercase: true })}
          value={gridSquare}
          onChange={(e) => setGridSquare(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveCheckin();
          }}
        />
        <input
          className="checkin-entry-address"
          placeholder={HINTS.address}
          style={hintWidth(HINTS.address)}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveCheckin();
          }}
        />
        <input
          className="checkin-entry-coords"
          placeholder={HINTS.coords}
          style={hintWidth(HINTS.coords)}
          title="Auto-filled from QRZ / ZIP / grid square — type over it with lat, lon or a mile marker (e.g. 'mile marker 182 on I-95')"
          aria-invalid={
            coordsText.trim() !== "" && parseCoords(coordsText) == null && phrase.status === "miss"
          }
          value={coordsText}
          onChange={(e) => {
            coordsEditedRef.current = e.target.value.trim() !== "";
            if (coordsEditedRef.current) setCoordsNote(null);
            setCoordsText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveCheckin();
          }}
        />
        <button
          type="button"
          className="link-button checkin-entry-clear"
          onClick={clearQrzData}
          disabled={!name && !qthLocation && !gridSquare && !address && !coordsText}
        >
          Clear
        </button>
      </div>
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
      {!log && (
        <div className="checkin-entry-row checkin-entry-row-traffic">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={hasTraffic}
              onChange={(e) => setHasTraffic(e.target.checked)}
            />
            Has traffic
          </label>
          {hasTraffic && (
            <input
              className="checkin-entry-traffic"
              placeholder={HINTS.traffic}
              style={hintWidth(HINTS.traffic)}
              value={traffic}
              onChange={(e) => setTraffic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveCheckin();
              }}
            />
          )}
        </div>
      )}
      {qrzStatus === "found" && lookupSource !== "qrz" && fileLacksStreet && (
        <p className="settings-hint checkin-entry-hint">
          Street address not filled in: the call-sign file on this computer was downloaded before
          street addresses were included. Update it in Settings → Offline Data.
        </p>
      )}
      {coordsNote && phrase.status === "idle" && (
        <p className="settings-hint checkin-entry-hint">
          Map point: {coordsNote}. Type over it to set an exact spot, or a mile marker.
        </p>
      )}
      {phrase.status === "hit" && (
        <p className="settings-hint checkin-entry-hint">
          ✓ {phrase.hit.label} → {formatCoords(phrase.hit.lat, phrase.hit.lon)} (estimated from road
          data)
        </p>
      )}
      {phrase.status === "miss" && (
        <p className="settings-hint checkin-entry-hint">
          Not coordinates or a known mile marker — the check-in will use its address/grid instead.
        </p>
      )}
    </div>
  );
}
