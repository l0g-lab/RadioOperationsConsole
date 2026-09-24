import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import * as api from "../../api";
import type { AprsIsPacket } from "../../types";
import { formatCoords } from "../../geo";
import LocationPicker from "../LocationPicker";
import AprsIsMap from "./AprsIsMap";

interface Props {
  loginCallSign: string;
}

interface RadiusOption {
  km: number;
  label: string;
}

// APRS-IS has no concept of county/state boundaries — a radius around a
// point is the closest it supports, so these are rough stand-ins rather
// than actual administrative areas.
const RADIUS_OPTIONS: RadiusOption[] = [
  { km: 25, label: "~25 km (local)" },
  { km: 75, label: "~75 km (county-sized)" },
  { km: 200, label: "~200 km (multi-county)" },
  { km: 500, label: "~500 km (state-sized)" },
];

const ROLLING_WINDOW_MS = 30 * 60 * 1000;
const MAX_PACKETS = 500;
const PRUNE_INTERVAL_MS = 30_000;

const AREA_STORAGE_KEY = "roc-aprs-is-area";

interface SavedArea {
  lat: number;
  lon: number;
  label: string;
  radiusKm: number;
}

// The chosen area/radius survives tab switches and restarts (this panel
// unmounts whenever another tab is opened). Best-effort: storage can be
// unavailable, in which case it just behaves as it did before.
function loadSavedArea(): SavedArea | null {
  try {
    const raw = localStorage.getItem(AREA_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedArea>;
    if (
      typeof v.lat !== "number" ||
      typeof v.lon !== "number" ||
      !Number.isFinite(v.lat) ||
      !Number.isFinite(v.lon) ||
      v.lat < -90 ||
      v.lat > 90 ||
      v.lon < -180 ||
      v.lon > 180
    ) {
      return null;
    }
    const radiusKm = RADIUS_OPTIONS.some((o) => o.km === v.radiusKm)
      ? (v.radiusKm as number)
      : RADIUS_OPTIONS[1].km;
    return { lat: v.lat, lon: v.lon, label: typeof v.label === "string" ? v.label : "", radiusKm };
  } catch {
    return null;
  }
}

function withinWindow(packet: AprsIsPacket, cutoffMs: number): boolean {
  const t = Date.parse(packet.received_at);
  return Number.isNaN(t) || t >= cutoffMs;
}

export default function AprsIsFeedPanel({ loginCallSign }: Props) {
  const [saved] = useState(loadSavedArea);
  const [areaLat, setAreaLat] = useState<number | null>(saved?.lat ?? null);
  const [areaLon, setAreaLon] = useState<number | null>(saved?.lon ?? null);
  const [areaLabel, setAreaLabel] = useState(saved?.label ?? "");
  const [radiusKm, setRadiusKm] = useState(saved?.radiusKm ?? RADIUS_OPTIONS[1].km);
  const [showPicker, setShowPicker] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packets, setPackets] = useState<AprsIsPacket[]>([]);

  const hasArea = areaLat != null && areaLon != null;

  useEffect(() => {
    if (areaLat == null || areaLon == null) return;
    try {
      const area: SavedArea = { lat: areaLat, lon: areaLon, label: areaLabel, radiusKm };
      localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify(area));
    } catch {
      // Storage unavailable — the area just won't persist.
    }
  }, [areaLat, areaLon, areaLabel, radiusKm]);

  // Listen for the whole lifetime of this panel, not just while `streaming`
  // is true — the backend can start emitting packets the instant the login
  // handshake succeeds, and Tauri doesn't queue events for a listener that
  // registers even slightly late, so gating this on `streaming` (set only
  // after the start command's round-trip returns) would silently drop
  // whatever arrives in that window. Also covers the connection ending on
  // its own (rejected login, server dropped us, ...) — without that, a dead
  // connection would just leave the UI saying "Streaming" forever with
  // nothing coming in and no indication why.
  useEffect(() => {
    const unlistens: (() => void)[] = [];
    let cancelled = false;

    listen<AprsIsPacket>("aprs-is-packet", (event) => {
      setPackets((prev) => {
        const next = [event.payload, ...prev];
        return next.length > MAX_PACKETS ? next.slice(0, MAX_PACKETS) : next;
      });
    }).then((fn) => {
      if (cancelled) fn();
      else unlistens.push(fn);
    });

    listen<string>("aprs-is-stream-ended", (event) => {
      setStreaming(false);
      setError(event.payload);
    }).then((fn) => {
      if (cancelled) fn();
      else unlistens.push(fn);
    });

    return () => {
      cancelled = true;
      unlistens.forEach((fn) => fn());
    };
  }, []);

  // Keeps the feed a rolling 30-minute window even when no new packet has
  // arrived recently to trigger a trim on its own.
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - ROLLING_WINDOW_MS;
      setPackets((prev) => prev.filter((p) => withinWindow(p, cutoff)));
    }, PRUNE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Don't leave a connection running in the background if this tab is
  // navigated away from (which unmounts this panel).
  useEffect(() => {
    return () => {
      api.stopAprsIsStream().catch(() => {});
    };
  }, []);

  async function handleStart() {
    if (areaLat == null || areaLon == null) return;
    setStarting(true);
    setError(null);
    try {
      await api.startAprsIsStream(loginCallSign, areaLat, areaLon, radiusKm);
      setPackets([]);
      setStreaming(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  }

  async function handleStop() {
    setStreaming(false);
    try {
      await api.stopAprsIsStream();
    } catch {
      // Best-effort — nothing useful to show the user for a stop failing.
    }
  }

  const withPosition = packets.filter((p) => p.lat != null && p.lon != null);

  return (
    <div className="panel">
      <h3>Live APRS-IS Feed (Area)</h3>
      <p className="settings-hint">
        Streams every packet APRS-IS hears within a radius of a point you choose — no API key or
        internet dependency beyond APRS-IS itself. It's a live feed, not a history lookup: packets
        only start arriving once you connect, and the list below stays a rolling last-30-minutes
        window of whatever's come in since.
      </p>

      <div className="inline-form">
        <button onClick={() => setShowPicker(true)} disabled={streaming}>
          {hasArea ? "Change area" : "Choose area"}
        </button>
        {hasArea && (
          <span className="weather-area-status">
            {areaLabel || formatCoords(areaLat as number, areaLon as number)}
          </span>
        )}
        <label>
          Radius:
          <select
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            disabled={streaming}
          >
            {RADIUS_OPTIONS.map((opt) => (
              <option key={opt.km} value={opt.km}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {!streaming ? (
          <button onClick={handleStart} disabled={!hasArea || !loginCallSign || starting}>
            {starting ? "Connecting…" : "Start streaming"}
          </button>
        ) : (
          <button onClick={handleStop}>Stop streaming</button>
        )}
      </div>

      {loginCallSign ? (
        <p className="settings-hint">
          Connects to APRS-IS as <strong>{loginCallSign}</strong> (read-only, your focused
          operator's call sign).
        </p>
      ) : (
        <p className="checkin-empty-state">
          Focus an operator with a call sign set to stream — APRS-IS servers reject generic
          placeholder call signs, so a real one is required.
        </p>
      )}

      {error && <p className="weather-area-error">APRS-IS: {error}</p>}

      {streaming && (
        <p className="weather-area-status">
          Streaming — {packets.length} packet(s) in the last 30 minutes ({withPosition.length}{" "}
          with a decoded position).
        </p>
      )}

      {packets.length > 0 && (
        <>
          {hasArea && (
            <AprsIsMap
              packets={withPosition}
              centerLat={areaLat as number}
              centerLon={areaLon as number}
            />
          )}
          <div className="event-list">
            {packets.map((p, i) => (
              <div key={`${p.source}-${p.received_at}-${i}`} className="event-row">
                <span>
                  {new Date(p.received_at).toLocaleTimeString()} — <strong>{p.source}</strong> @{" "}
                  {p.lat != null && p.lon != null
                    ? formatCoords(p.lat, p.lon)
                    : "no position decoded"}
                  {p.comment ? `: ${p.comment}` : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {showPicker && (
        <LocationPicker
          title="Area center"
          initialLat={areaLat}
          initialLon={areaLon}
          initialLabel={areaLabel}
          onSave={(lat, lon, label) => {
            setAreaLat(lat);
            setAreaLon(lon);
            setAreaLabel(label);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
