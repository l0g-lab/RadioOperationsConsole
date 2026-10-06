import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import * as api from "../../api";
import type { AprsIsPacket } from "../../types";
import { formatCoords } from "../../geo";
import LocationPicker from "../LocationPicker";
import AprsIsMap from "./AprsIsMap";
import { QUIET_MS, heardAgo, stationsFrom, type Station, type StationKind } from "../../aprs";
import { useMinuteClock } from "../../hooks/useMinuteClock";
import { pad2 } from "../../utils";
import {
  Ambulance,
  Bike,
  Car,
  CircleDot,
  CloudSun,
  Footprints,
  House,
  Plane,
  RadioTower,
  Rss,
  Ship,
  Truck,
  Wifi,
  type LucideIcon,
} from "lucide-react";

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
  { km: 25, label: "15 mi (local)" },
  { km: 75, label: "45 mi (county)" },
  { km: 200, label: "125 mi (multi-county)" },
  { km: 500, label: "300 mi (state)" },
];

const KIND_ICONS: Record<StationKind["kind"], LucideIcon> = {
  car: Car,
  truck: Truck,
  home: House,
  weather: CloudSun,
  digi: RadioTower,
  igate: Wifi,
  foot: Footprints,
  boat: Ship,
  plane: Plane,
  bike: Bike,
  emergency: Ambulance,
  station: CircleDot,
};

const hm = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

/** One station in two short lines: icon, call sign, kind, last heard; then how far and its comment. */
function StationRow({
  s,
  now,
  selected,
  onSelect,
}: {
  s: Station;
  now: Date;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = KIND_ICONS[s.kind.kind];
  const quiet = now.getTime() - (Date.parse(s.heardAt) || 0) > QUIET_MS;
  return (
    <li>
      <button
        className={"aprs-station" + (selected ? " selected" : "") + (quiet ? " aprs-quiet" : "")}
        aria-current={selected || undefined}
        onClick={onSelect}
      >
        <span className="aprs-station-line">
          <Icon className={`aprs-station-icon aprs-${s.kind.group}`} aria-hidden />
          <span className="aprs-station-call">{s.call}</span>
          <span className="aprs-station-kind">{s.kind.label}</span>
          <span className="aprs-station-heard" title={`Heard ${s.packets} time${s.packets === 1 ? "" : "s"}`}>
            {heardAgo(s.heardAt, now)}
          </span>
        </span>
        {(() => {
          const detail = [s.distance || (s.lat == null ? "no position" : ""), s.comment].filter(Boolean).join(" · ");
          return (
            <span className="aprs-station-detail" title={detail || undefined}>
              {detail}
            </span>
          );
        })()}
      </button>
    </li>
  );
}

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
  const [editingArea, setEditingArea] = useState(false);
  const [selectedCall, setSelectedCall] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const now = useMinuteClock();

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

  const stations = stationsFrom(packets, hasArea ? { lat: areaLat as number, lon: areaLon as number } : null);
  const radiusLabel = RADIUS_OPTIONS.find((o) => o.km === radiusKm)?.label.replace(/ \(.*\)$/, "") ?? `${radiusKm} km`;
  const areaName = areaLabel || (hasArea ? formatCoords(areaLat as number, areaLon as number) : "");

  const areaEditor = (
    <div className="inline-form aprs-area-editor">
      <button onClick={() => setShowPicker(true)} disabled={streaming}>
        {hasArea ? "Move the center" : "Choose the center"}
      </button>
      <label>
        Radius{" "}
        <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} disabled={streaming}>
          {RADIUS_OPTIONS.map((opt) => (
            <option key={opt.km} value={opt.km}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {hasArea && editingArea && <button onClick={() => setEditingArea(false)}>Done</button>}
      {streaming && <span className="settings-hint">Stop to change the area.</span>}
    </div>
  );

  return (
    <div className="panel aprs-panel">
      <div className="panel-header-row">
        <h3>
          <Rss className="heading-icon" />
          APRS{hasArea ? ` — ${areaName} · ${radiusLabel}` : ""}
        </h3>
        <div className="checkin-roster-header-actions">
          {streaming && (
            <span className="aprs-live" title="Connected to APRS-IS">
              <span className="aprs-live-dot" aria-hidden /> Live · {stations.length} station
              {stations.length === 1 ? "" : "s"} · {packets.length} packet{packets.length === 1 ? "" : "s"}
            </span>
          )}
          {hasArea &&
            (!streaming ? (
              <button className="primary" onClick={handleStart} disabled={!loginCallSign || starting}>
                {starting ? "Connecting…" : "Start"}
              </button>
            ) : (
              <button onClick={handleStop}>Stop</button>
            ))}
          {hasArea && !editingArea && !streaming && (
            <button className="link-button" onClick={() => setEditingArea(true)}>
              Change area
            </button>
          )}
        </div>
      </div>
      <p className="settings-hint">
        {loginCallSign ? (
          <>
            Live APRS-IS traffic within the area, received as <strong>{loginCallSign}</strong> (read-only). It shows the
            last 30 minutes; nothing is kept.
          </>
        ) : (
          "Set a call sign on the default operator to connect — APRS-IS servers turn away made-up ones."
        )}
      </p>

      {(!hasArea || editingArea) && areaEditor}
      {error && <p className="weather-area-error">APRS-IS: {error}</p>}

      {!hasArea ? (
        <p className="checkin-empty-state">Choose a center and radius to see the stations around it.</p>
      ) : (
        <div className="aprs-workspace">
          <AprsIsMap
            stations={stations}
            centerLat={areaLat as number}
            centerLon={areaLon as number}
            radiusKm={radiusKm}
            selectedCall={selectedCall}
            onSelect={setSelectedCall}
          />
          <div className="aprs-stations">
            <h4 className="net-day-heading">
              Stations{stations.length > 0 ? ` (${stations.length})` : ""}
            </h4>
            {stations.length === 0 ? (
              <p className="settings-hint">
                {streaming
                  ? "Listening — stations appear as they're heard."
                  : "Start to see the stations heard around the center."}
              </p>
            ) : (
              <ul className="aprs-station-list">
                {stations.map((st) => (
                  <StationRow
                    key={st.call}
                    s={st}
                    now={now}
                    selected={st.call === selectedCall}
                    onSelect={() => setSelectedCall(st.call)}
                  />
                ))}
              </ul>
            )}
            {packets.length > 0 && (
              <button className="link-button" onClick={() => setShowRaw((v) => !v)}>
                {showRaw ? "Hide raw packets" : `Show raw packets (${packets.length})`}
              </button>
            )}
            {showRaw && (
              <ul className="aprs-raw">
                {packets.map((p, i) => (
                  <li key={`${p.source}-${p.received_at}-${i}`} className="checkin-row-mono">
                    {hm(p.received_at)} {p.source}&gt;{p.dest}
                    {p.path ? `,${p.path}` : ""}: {p.comment ?? ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
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
