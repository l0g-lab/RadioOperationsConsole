import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import type { Feature, Geometry } from "geojson";
import * as api from "../../api";
import { createBaseMap } from "../../map/baseMap";
import { EXPAND_EVENT } from "../../map/expandControl";
import { alertLevel, areaText, untilText, type NwsAlert } from "../../nwsAlerts";
import { pad2 } from "../../utils";
import { ChevronLeft, ChevronRight, Pause, Play, RefreshCw } from "lucide-react";

/** NOAA's national radar mosaic, as radar.weather.gov draws it (RADAR-010). */
const RADAR_WMS = "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows";
const RADAR_LAYER = "conus_bref_qcd";
/** About 30 scans step through in about ten seconds. */
const FRAME_MS = 330;
/** Steps the loop rests on the latest scan, so it reads as "now". */
const REST_FRAMES = 6;
/** Pictures loading ahead of the one shown while the loop plays. */
const LOAD_AHEAD = 3;
/** While shown, new scans are checked for this often (RADAR-014). */
export const RADAR_REFRESH_MS = 5 * 60_000;
const OPACITY_KEY = "roc-radar-opacity";

function loadOpacity(): number {
  try {
    const v = Number(localStorage.getItem(OPACITY_KEY));
    return v > 0 && v <= 1 ? v : 0.7;
  } catch {
    return 0.7;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

/**
 * Scan times to ask for when NOAA's list of scans can't be had: every two
 * minutes over the last hour, oldest first. The server answers each with
 * its nearest scan (the layer's time dimension is "nearestValue"), so the
 * radar still works if that one request is refused (RADAR-015).
 */
export function fallbackFrameTimes(now = new Date()): string[] {
  const step = 2 * 60_000;
  const end = Math.floor(now.getTime() / step) * step;
  return Array.from({ length: 30 }, (_, i) => new Date(end - (29 - i) * step).toISOString());
}

/**
 * One radar picture of exactly what the map shows (RADAR-016): a WMS GetMap
 * for the map's bounds in web-Mercator meters, at its size in pixels, for one
 * scan — one request per frame instead of a dozen tiles.
 */
export function radarImageUrl(time: string, bbox: [number, number, number, number], width: number, height: number): string {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: RADAR_LAYER,
    STYLES: "",
    FORMAT: "image/png",
    TRANSPARENT: "true",
    CRS: "EPSG:3857",
    WIDTH: String(Math.round(width)),
    HEIGHT: String(Math.round(height)),
    BBOX: bbox.map((n) => n.toFixed(1)).join(","),
    TIME: time,
  });
  return `${RADAR_WMS}?${params}`;
}

/** "19:42, 4 min ago" for a radar scan. */
export function frameLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60_000));
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}, ${ago}`;
}

/**
 * Live radar on the app's own map (weather-radar-display.md): zoom, pan, and
 * Full view; NOAA's radar mosaic over it, looping the last hour (playing on
 * its own unless reduced motion is asked for); an opacity slider; and the NWS alerts' areas
 * outlined, warnings in red and the rest in amber. Radar isn't saved to disk;
 * the base map works offline from its saved tiles.
 */
export default function RadarMap({
  lat,
  lon,
  alerts,
  offline,
}: {
  lat: number;
  lon: number;
  alerts: NwsAlert[];
  offline: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // One picture per scan, each for the view it was drawn for, and whether
  // that picture has arrived (or failed: either way, nothing to wait for).
  const imagesRef = useRef<Map<string, { image: L.ImageOverlay; view: string; ready: boolean }>>(new Map());
  // Bumped when the view settles after a pan, zoom, or resize, to redraw the shown scan.
  const [viewTick, setViewTick] = useState(0);
  // NOAA's server turned a picture away (busy): say so rather than show nothing.
  const [refused, setRefused] = useState(false);
  // In Full view the panel's controls are hidden behind the map, so a small
  // strip of them goes on the map itself (RADAR-017).
  const [expanded, setExpanded] = useState(false);
  const alertsRef = useRef<L.GeoJSON | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  playingRef.current = playing;
  const [opacity, setOpacity] = useState(loadOpacity);
  const [showAlerts, setShowAlerts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = createBaseMap(containerRef.current, [lat, lon], 8);
    // The radar sits above the base map but under the alert outlines and the area marker.
    map.createPane("radar").style.zIndex = "350";
    L.circleMarker([lat, lon], { radius: 5, className: "radar-center", interactive: false }).addTo(map);
    // Only once a pan or zoom has finished: dragging moves the picture with the map.
    map.on("moveend", () => setViewTick((t) => t + 1));
    map.on(EXPAND_EVENT, (e) => setExpanded(Boolean((e as unknown as { expanded: boolean }).expanded)));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      imagesRef.current = new Map();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setView([lat, lon], mapRef.current.getZoom());
  }, [lat, lon]);

  // The map fills whatever room its panel has, which changes with the window
  // and the alerts above it: redraw to fit each time.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => mapRef.current?.invalidateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The loop plays on its own once the scans are in, unless the computer
  // asks for reduced motion (RADAR-011); Refresh keeps it as it was.
  const startedRef = useRef(false);

  async function loadFrames() {
    if (offline) return;
    setLoading(true);
    setError(null);
    try {
      // NOAA's list of scans; if that's refused, every two minutes (RADAR-015).
      const f = await api.fetchRadarFrames().catch(() => fallbackFrameTimes());
      // Scans that have aged out of the hour: unload their pictures.
      for (const [t, entry] of imagesRef.current) {
        if (!f.includes(t)) {
          entry.image.remove();
          imagesRef.current.delete(t);
        }
      }
      setFrames(f);
      // A paused loop stays on the latest scan; a playing one carries on.
      setIndex((i) => (playingRef.current ? Math.min(i, f.length - 1) : f.length - 1));
      if (!startedRef.current) {
        startedRef.current = true;
        setPlaying(!prefersReducedMotion());
      }
    } catch {
      setError("The radar couldn't be reached — try Refresh.");
    } finally {
      setLoading(false);
    }
  }

  // Fetched on showing, then every five minutes while shown and online, so a
  // radar left up stays current (RADAR-014).
  useEffect(() => {
    if (offline) return;
    loadFrames();
    const id = setInterval(loadFrames, RADAR_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);

  /**
   * The picture of one scan for the map's current view: made the first time
   * the scan is shown, and redrawn when shown after the view has changed.
   */
  function imageFor(time: string): L.ImageOverlay {
    const map = mapRef.current as L.Map;
    const bounds = map.getBounds();
    const size = map.getSize();
    const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
    const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
    const bbox: [number, number, number, number] = [sw.x, sw.y, ne.x, ne.y];
    const view = `${bbox.map((n) => Math.round(n)).join(",")}:${size.x}x${size.y}`;
    const url = radarImageUrl(time, bbox, size.x, size.y);
    const entry = imagesRef.current.get(time);
    if (!entry) {
      const image = L.imageOverlay(url, bounds, {
        pane: "radar",
        opacity: 0,
        interactive: false,
        attribution: "Radar: NOAA",
      }).addTo(map);
      const made = { image, view, ready: false };
      image.on("error", () => {
        made.ready = true;
        setRefused(true);
      });
      image.on("load", () => {
        made.ready = true;
        setRefused(false);
      });
      imagesRef.current.set(time, made);
      return image;
    }
    if (entry.view !== view) {
      entry.ready = false;
      entry.image.setUrl(url);
      entry.image.setBounds(bounds);
      entry.view = view;
    }
    return entry.image;
  }

  // Show the current scan, with the next few loading ahead while playing; the
  // rest stay loaded but hidden, so the loop runs smoothly.
  useEffect(() => {
    if (!mapRef.current || offline || frames.length === 0) return;
    const current = frames[index];
    imageFor(current).setOpacity(opacity);
    if (playing) {
      for (let k = 1; k <= LOAD_AHEAD; k++) imageFor(frames[(index + k) % frames.length]);
    }
    for (const [t, entry] of imagesRef.current) if (t !== current) entry.image.setOpacity(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, index, opacity, offline, playing, viewTick]);

  useEffect(() => {
    try {
      localStorage.setItem(OPACITY_KEY, String(opacity));
    } catch {
      // Only the remembered setting is lost.
    }
  }, [opacity]);

  // The loop: step through the scans, resting a moment on the latest.
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    let rest = 0;
    const id = setInterval(() => {
      setIndex((i) => {
        if (i === frames.length - 1 && rest < REST_FRAMES) {
          rest++;
          return i;
        }
        const next = (i + 1) % frames.length;
        // Not until its picture has arrived: the loop waits on a good frame
        // rather than flash a blank one.
        if (!imagesRef.current.get(frames[next])?.ready) return i;
        rest = 0;
        return next;
      });
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [playing, frames.length]);

  // The alerts' areas: warnings red, the rest amber; click one for which alert it is.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    alertsRef.current?.remove();
    alertsRef.current = null;
    if (!showAlerts) return;
    const features: Feature<Geometry, NwsAlert>[] = alerts
      .filter((a) => a.geometry)
      .map((a) => ({ type: "Feature", geometry: a.geometry as Geometry, properties: a }));
    if (features.length === 0) return;
    alertsRef.current = L.geoJSON(features, {
      style: (f) => ({ className: `radar-alert radar-alert-${alertLevel(f?.properties?.event)}` }),
      onEachFeature: (f, layer) => {
        const a = f.properties as NwsAlert;
        const box = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = a.event ?? "Alert";
        box.appendChild(title);
        const detail = document.createElement("div");
        detail.textContent = [areaText(a.areaDesc), untilText(a)].filter(Boolean).join(" · ");
        box.appendChild(detail);
        layer.bindPopup(box);
      },
    }).addTo(map);
  }, [alerts, showAlerts]);

  const outlined = alerts.filter((a) => a.geometry).length;
  const zoneOnly = alerts.length - outlined;
  const status = offline
    ? "Working offline — radar needs the internet"
    : error
      ? error
      : refused
        ? "NOAA's radar server is busy — trying again at the next refresh"
        : frames.length
          ? frameLabel(frames[index])
          : loading
            ? "Loading radar…"
            : "No radar scans available";

  const loopButtons = (
    <>
      <button className="icon-button" aria-label="Earlier scan" onClick={() => step(-1)} disabled={frames.length < 2}>
        <ChevronLeft />
      </button>
      <button
        className="icon-button"
        aria-label={playing ? "Pause the loop" : "Play the last hour"}
        onClick={() => setPlaying((p) => !p)}
        disabled={frames.length < 2}
      >
        {playing ? <Pause /> : <Play />}
      </button>
      <button className="icon-button" aria-label="Later scan" onClick={() => step(1)} disabled={frames.length < 2}>
        <ChevronRight />
      </button>
    </>
  );

  /**
   * Keeps presses, double-clicks and scrolls on the strip from panning or
   * zooming the map under it. Clicks still bubble, so React (listening at the
   * page's root) gets the buttons' clicks.
   */
  const holdMapEvents = (el: HTMLDivElement | null) => {
    if (!el) return;
    L.DomEvent.on(el, "mousedown touchstart pointerdown dblclick", L.DomEvent.stopPropagation);
    L.DomEvent.disableScrollPropagation(el);
  };

  const step = (d: number) => {
    setPlaying(false);
    setIndex((i) => (i + d + frames.length) % frames.length);
  };

  return (
    <div className="radar-map">
      <div className="radar-controls" role="group" aria-label="Radar loop">
        {loopButtons}
        <span className="radar-time checkin-row-mono" aria-live="off">
          {status}
        </span>
        <label className="radar-opacity">
          Opacity
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.1}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            aria-label="Radar opacity"
          />
        </label>
        <label className="checkbox-row" title="Outline the alerts' areas">
          <input type="checkbox" checked={showAlerts} onChange={(e) => setShowAlerts(e.target.checked)} />
          Alerts
        </label>
        <button className="icon-button" aria-label="Refresh radar" title="Get the latest scans" onClick={loadFrames} disabled={loading || offline}>
          <RefreshCw />
        </button>
      </div>
      {showAlerts && zoneOnly > 0 && (
        <p className="settings-hint radar-note">
          {zoneOnly} alert{zoneOnly === 1 ? " covers" : "s cover"} whole counties and {zoneOnly === 1 ? "isn't" : "aren't"}{" "}
          outlined — see the Alerts list.
        </p>
      )}
      <div ref={containerRef} className="leaflet-map-container radar-map-view" />
      {expanded &&
        containerRef.current &&
        createPortal(
          <div className="radar-fullview-strip" role="group" aria-label="Radar loop" ref={holdMapEvents}>
            {loopButtons}
            <span className="checkin-row-mono">{status}</span>
          </div>,
          containerRef.current
        )}
    </div>
  );
}
