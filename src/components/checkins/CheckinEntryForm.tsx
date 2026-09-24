import { useEffect, useRef, useState } from "react";
import * as api from "../../api";
import { QRZ_ERR_NOT_CONFIGURED, ERR_OFFLINE } from "../../types";
import { lookupCallsign, type CallsignSource } from "../../callsignLookup";
import { resolveOfflineLocationAsync } from "../../locationResolution";
import { formatCoords, parseCoords } from "../../geo";
import type { MileMarkerHit } from "../../types";

interface Props {
  activityId: string;
  operatorId: string | null;
  qrzConfigured: boolean;
  /** The offline FCC call-sign directory is downloaded (used only when QRZ isn't available). */
  offlineCallsAvailable: boolean;
  rapidEntryMode: boolean;
  focusCallSignSignal: number;
  onSaved: (checkinId: string) => void;
}

type QrzStatus = "idle" | "loading" | "found" | "not_found" | "error";

const QRZ_LOOKUP_DEBOUNCE_MS = 400;
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
}: Props) {
  const [callSign, setCallSign] = useState("");
  const [name, setName] = useState("");
  const [qthLocation, setQthLocation] = useState("");
  const [gridSquare, setGridSquare] = useState("");
  const [address, setAddress] = useState("");
  const [hasTraffic, setHasTraffic] = useState(false);
  const [traffic, setTraffic] = useState("");
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
      return;
    }
    if (
      !(qrzConfigured || offlineCallsAvailable) ||
      name.trim() ||
      call.length < QRZ_LOOKUP_MIN_LENGTH
    ) {
      setQrzStatus("idle");
      return;
    }
    const timer = setTimeout(() => {
      qrzRequestedForRef.current = call;
      setQrzStatus("loading");
      // QRZ first; the offline FCC directory only when QRZ isn't available.
      lookupCallsign(call, qrzConfigured).then((outcome) => {
        if (qrzRequestedForRef.current !== call || callSign.trim().toUpperCase() !== call) {
          return;
        }
        if (outcome.kind === "found") {
          const result = outcome.data;
          setLookupSource(outcome.source);
          setFileLacksStreet(Boolean(outcome.fileLacksStreet));
          setQrzStatus("found");
          if (!name.trim() && result.name) setName(result.name);
          if (!qthLocation.trim() && result.qth_location) setQthLocation(result.qth_location);
          if (!gridSquare.trim() && result.grid_square) setGridSquare(result.grid_square);
          if (!address.trim() && result.address) setAddress(result.address);
          if (result.exact_lat != null && result.exact_lon != null) {
            setQrzExact({ lat: result.exact_lat, lon: result.exact_lon });
          }
        } else if (outcome.kind === "not_found") {
          setLookupSource(outcome.source);
          setQrzStatus("not_found");
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
  }

  async function handleSaveCheckin() {
    const call = callSign.trim();
    if (!call) return;
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
      hasTraffic ? traffic.trim() || null : null
    );
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
      <div className="checkin-entry-labels">
        <label htmlFor="checkin-callsign">Call sign</label>
        <label htmlFor="checkin-name">
          Name{" "}
          {qrzStatus === "loading" && (
            <span className="qrz-status qrz-status-loading">looking up…</span>
          )}
          {qrzStatus === "found" && (
            <span className="qrz-status qrz-status-found">
              {lookupSource === "fcc" ? "FCC record (offline)" : "QRZ match"}
            </span>
          )}
          {qrzStatus === "not_found" && (
            <span className="qrz-status qrz-status-muted">
              {lookupSource === "fcc" ? "not in FCC file" : "no QRZ match"}
            </span>
          )}
          {qrzStatus === "error" && (
            <span className="qrz-status qrz-status-muted">QRZ lookup failed</span>
          )}
        </label>
      </div>
      <div className="checkin-entry-row">
        <input
          id="checkin-callsign"
          ref={callSignRef}
          autoFocus
          className="checkin-entry-call"
          placeholder="Enter call sign and press Enter"
          value={callSign}
          onChange={(e) => setCallSign(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveCheckin();
          }}
        />
        <input
          id="checkin-name"
          className="checkin-entry-name"
          placeholder="Name (optional, auto-filled from QRZ if configured)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveCheckin();
          }}
        />
        <button onClick={handleSaveCheckin}>Save check-in</button>
      </div>
      <div className="checkin-entry-row checkin-entry-row-secondary">
        <input
          className="checkin-entry-qth"
          placeholder="QTH location (optional, auto-filled from QRZ)"
          value={qthLocation}
          onChange={(e) => setQthLocation(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveCheckin();
          }}
        />
        <input
          className="checkin-entry-grid"
          placeholder="Grid square"
          value={gridSquare}
          onChange={(e) => setGridSquare(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveCheckin();
          }}
        />
        <input
          className="checkin-entry-address"
          placeholder="Full address (optional, auto-filled from QRZ)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveCheckin();
          }}
        />
        <input
          className="checkin-entry-coords"
          placeholder="Coordinates, or e.g. MM 182 turnpike"
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
            placeholder="Traffic — what they have to pass (optional, can be added later)"
            value={traffic}
            onChange={(e) => setTraffic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveCheckin();
            }}
          />
        )}
      </div>
      {qrzStatus === "found" && lookupSource === "fcc" && fileLacksStreet && (
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
