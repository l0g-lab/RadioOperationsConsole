import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import type { Feature, Geometry } from "geojson";
import * as api from "../../api";
import { createBaseMap } from "../../map/baseMap";
import { EXPAND_EVENT } from "../../map/expandControl";
import { alertColor, alertLevel, type NwsAlert } from "../../nwsAlerts";
import {
  alertsPopupContent,
  containsPoint,
  latestWarningsTime,
  latestWarningsTimeUrl,
  parseWarnings,
  shapesToDraw,
  warningsInViewUrl,
  withNwsText,
} from "./radarAlerts";
import { NATIONAL, fallbackFrameTimes, frameMs, radarImageUrl, radarSourceFor, type RadarSource } from "./radarSource";
import { pad2 } from "../../utils";
import { ChevronLeft, ChevronRight, Pause, Play, RefreshCw } from "lucide-react";

/** Steps the loop rests on the latest scan, so it reads as "now". */
const REST_FRAMES = 6;
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

type Bbox = [number, number, number, number];

/** What the map shows now: its bounds, in web-Mercator meters too, and its size. */
function currentView(map: L.Map) {
  const bounds = map.getBounds();
  const size = map.getSize();
  const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
  const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
  const bbox: Bbox = [sw.x, sw.y, ne.x, ne.y];
  return { bounds, bbox, size };
}

/**
 * One scan's pictures: the newest that's arrived (for whatever view it was
 * drawn for), one on its way for the view now, and the view whose picture
 * NOAA turned away, so it isn't asked for again until the view or the scans
 * change.
 */
interface Frame {
  shown: L.ImageOverlay | null;
  shownView: string;
  pending: L.ImageOverlay | null;
  pendingView: string;
  failedView: string;
}

/** "19:42, 4 min ago" for a radar scan. *//** "19:42, 4 min ago" for a radar scan. */
export function frameLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60_000));
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}, ${ago}`;
}

/**
 * Live radar on the app's own map (weather-radar-display.md): zoom, pan, and
 * Full view; NOAA's national radar mosaic over it, or close in the nearest
 * station's sharper scans, looping the last hour (playing on its own unless
 * reduced motion is asked for); an opacity slider; and the alerts as shapes in
 * NWS's colors — the area's own and every storm warning in view — that say
 * what they are when clicked. Radar isn't saved to disk; the base map works
 * offline from its saved tiles.
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
  // Each scan's pictures, for the radar shown now (RADAR-016).
  const framesStoreRef = useRef<Map<string, Frame>>(new Map());
  // The last radar's picture, kept showing until the new one's arrives.
  const retiringRef = useRef<L.ImageOverlay[]>([]);
  // The national mosaic, or the nearest station's sharper radar close in
  // (RADAR-020); stations whose scans couldn't be had aren't tried again.
  const [source, setSource] = useState<RadarSource>(NATIONAL);
  const sourceRef = useRef<RadarSource>(NATIONAL);
  const badStationsRef = useRef<Set<string>>(new Set());
  // Bumped when the view settles after a pan, zoom, or resize, to redraw the shown scan.
  const [viewTick, setViewTick] = useState(0);
  // NOAA's server turned a picture away (busy): say so rather than show nothing.
  const [refused, setRefused] = useState(false);
  // In Full view the panel's controls are hidden behind the map, so a small
  // strip of them — the loop, the scan's time, the opacity and Alerts — goes
  // on the map itself (RADAR-017).
  const [expanded, setExpanded] = useState(false);
  const alertsRef = useRef<L.LayerGroup | null>(null);
  // NOAA's storm warnings in view (RADAR-018), and when they were last asked
  // for: set on each refresh, so NOAA's latest refresh time is asked again.
  const [noaaWarnings, setNoaaWarnings] = useState<NwsAlert[]>([]);
  const [warningsAt, setWarningsAt] = useState(() => Date.now());
  const warningsTimeRef = useRef<{ at: number; time: string } | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [opacity, setOpacity] = useState(loadOpacity);
  // For the loop's timer and the pictures' load events, which outlive a render.
  const playingRef = useRef(false);
  playingRef.current = playing;
  const framesRef = useRef<string[]>([]);
  framesRef.current = frames;
  const currentTimeRef = useRef<string | null>(null);
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;
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
      framesStoreRef.current = new Map();
      retiringRef.current = [];
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

  /** Shows the current scan's picture, hiding the rest; the last radar's goes once it's up. */
  function paint() {
    const current = currentTimeRef.current;
    for (const [t, f] of framesStoreRef.current) f.shown?.setOpacity(t === current ? opacityRef.current : 0);
    if (current && framesStoreRef.current.get(current)?.shown) {
      for (const old of retiringRef.current) old.remove();
      retiringRef.current = [];
    }
  }

  /** Removes every picture: on changing radar (all but the one showing) or going offline. */
  function clearPictures(keepShowing: boolean) {
    const current = currentTimeRef.current;
    for (const [t, f] of framesStoreRef.current) {
      f.pending?.remove();
      if (keepShowing && t === current && f.shown) retiringRef.current.push(f.shown);
      else f.shown?.remove();
    }
    framesStoreRef.current = new Map();
    if (!keepShowing) {
      for (const old of retiringRef.current) old.remove();
      retiringRef.current = [];
    }
  }

  /**
   * Asks for a scan's picture of the view now, unless it has it, is getting
   * it, or was turned away for it. Until it arrives the scan's last picture
   * stays (for the old view, but in the right place), so a pan or zoom never
   * blanks the radar or stretches it, and the loop doesn't wait on it.
   */
  function want(time: string) {
    const map = mapRef.current;
    if (!map) return;
    const { bounds, bbox, size } = currentView(map);
    if (size.x === 0 || size.y === 0) return;
    const src = sourceRef.current;
    const view = `${src}:${bbox.map((n) => Math.round(n)).join(",")}:${size.x}x${size.y}`;
    let f = framesStoreRef.current.get(time);
    if (!f) {
      f = { shown: null, shownView: "", pending: null, pendingView: "", failedView: "" };
      framesStoreRef.current.set(time, f);
    }
    if (f.shownView === view || f.pendingView === view || f.failedView === view) return;
    f.pending?.remove();
    const frame = f;
    const image = L.imageOverlay(radarImageUrl(src, time, bbox, size.x, size.y, window.devicePixelRatio || 1), bounds, {
      pane: "radar",
      opacity: 0,
      interactive: false,
      attribution: "Radar: NOAA",
    }).addTo(map);
    frame.pending = image;
    frame.pendingView = view;
    image.on("load", () => {
      if (frame.pending !== image) return;
      frame.shown?.remove();
      frame.shown = image;
      frame.shownView = view;
      frame.pending = null;
      frame.pendingView = "";
      setRefused(false);
      paint();
    });
    image.on("error", () => {
      if (frame.pending !== image) return;
      image.remove();
      frame.pending = null;
      frame.pendingView = "";
      frame.failedView = view;
      setRefused(true);
    });
  }

  // The loop plays on its own once the scans are in, unless the computer
  // asks for reduced motion (RADAR-011); Refresh keeps it as it was.
  const startedRef = useRef(false);

  async function loadFrames() {
    if (offline) return;
    const src = sourceRef.current;
    setLoading(true);
    setError(null);
    setWarningsAt(Date.now());
    // A picture turned away may come now.
    for (const f of framesStoreRef.current.values()) f.failedView = "";
    try {
      // NOAA's list of scans; if that's refused, the hour at the usual step (RADAR-015).
      const f = await api.fetchRadarFrames(src === NATIONAL ? undefined : src).catch(() => fallbackFrameTimes(src));
      if (sourceRef.current !== src) return;
      if (f.length === 0 && src !== NATIONAL) {
        // The station has no scans this hour (down for maintenance, say).
        badStationsRef.current.add(src);
        setSource(NATIONAL);
        return;
      }
      // Scans that have aged out of the hour: unload their pictures.
      for (const [t, fr] of framesStoreRef.current) {
        if (!f.includes(t)) {
          fr.shown?.remove();
          fr.pending?.remove();
          framesStoreRef.current.delete(t);
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

  // Close in, the nearest station's radar; farther out, the national mosaic
  // (RADAR-020): decided as each pan or zoom settles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    let next = radarSourceFor(map.getZoom(), c.lat, c.lng, sourceRef.current);
    if (badStationsRef.current.has(next)) next = NATIONAL;
    setSource(next);
  }, [viewTick]);

  // The radar's scans: fetched on showing and on changing radar, then every
  // five minutes while shown and online, so a radar left up stays current
  // (RADAR-014). The last radar's picture stays until the new one's is in.
  useEffect(() => {
    sourceRef.current = source;
    if (offline) {
      clearPictures(false);
      return;
    }
    clearPictures(true);
    setFrames([]);
    loadFrames();
    const id = setInterval(loadFrames, RADAR_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, offline]);

  // The current scan's picture first, then (while playing) every other's for
  // this view, so the loop runs smoothly; shown as each arrives.
  useEffect(() => {
    if (!mapRef.current || offline || frames.length === 0) return;
    const at = Math.min(index, frames.length - 1);
    currentTimeRef.current = frames[at];
    want(frames[at]);
    if (playing) for (let k = 1; k < frames.length; k++) want(frames[(at + k) % frames.length]);
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, index, offline, playing, viewTick]);

  useEffect(() => {
    paint();
    try {
      localStorage.setItem(OPACITY_KEY, String(opacity));
    } catch {
      // Only the remembered setting is lost.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opacity]);

  // The loop: step through the scans, resting a moment on the latest. It reads
  // the scans through a ref, so a refresh's new list is used at once.
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    let rest = 0;
    const id = setInterval(() => {
      const list = framesRef.current;
      if (list.length < 2) return;
      setIndex((i) => {
        const at = Math.min(i, list.length - 1);
        if (at === list.length - 1 && rest < REST_FRAMES) {
          rest++;
          return at;
        }
        // The next scan with a picture, skipping any NOAA turned away; one
        // still on its way is waited for rather than shown blank.
        for (let k = 1; k < list.length; k++) {
          const next = (at + k) % list.length;
          const f = framesStoreRef.current.get(list[next]);
          if (f?.shown) {
            rest = 0;
            return next;
          }
          if (!f?.failedView) return at;
        }
        return at;
      });
    }, frameMs(frames.length));
    return () => clearInterval(id);
  }, [playing, frames.length]);

  // Every storm warning in view, from NOAA: asked for when the view settles
  // and on each refresh, at NOAA's latest refresh (RADAR-018). What's drawn
  // stays if a request fails; the next refresh tries again.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showAlerts || offline) {
      setNoaaWarnings([]);
      return;
    }
    let current = true;
    const b = map.getBounds();
    const clamp = (n: number, lim: number) => Math.max(-lim, Math.min(lim, n));
    const view: [number, number, number, number] = [
      clamp(b.getWest(), 180),
      clamp(b.getSouth(), 90),
      clamp(b.getEast(), 180),
      clamp(b.getNorth(), 90),
    ];
    (async () => {
      try {
        let time = warningsTimeRef.current?.at === warningsAt ? warningsTimeRef.current.time : null;
        if (!time) {
          const res = await fetch(latestWarningsTimeUrl());
          time = res.ok ? latestWarningsTime(await res.json()) : null;
          if (!time) return;
          warningsTimeRef.current = { at: warningsAt, time };
        }
        const res = await fetch(warningsInViewUrl(view, time));
        if (!res.ok) return;
        const list = parseWarnings(await res.json());
        if (current) setNoaaWarnings(list);
      } catch {
        // NOAA unreachable: keep what's drawn.
      }
    })();
    return () => {
      current = false;
    };
  }, [showAlerts, offline, viewTick, warningsAt]);

  // The alerts as shapes: the area's own outlined ones and NOAA's warnings in
  // view, each once, in its NWS color over a light halo so it shows on any
  // radar or map; non-warnings dashed. Pointing at one thickens it; clicking
  // it says what it is and what's going on — every shape under the click, if
  // they overlap (RADAR-013, RADAR-019).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    alertsRef.current?.remove();
    alertsRef.current = null;
    if (!showAlerts) return;
    const shapes = shapesToDraw(alerts, noaaWarnings);
    if (shapes.length === 0) return;
    const features: Feature<Geometry, NwsAlert>[] = shapes.map((a) => ({
      type: "Feature",
      geometry: a.geometry as Geometry,
      properties: a,
    }));
    const style = (f?: Feature<Geometry, NwsAlert>): L.PathOptions => {
      const color = alertColor(f?.properties?.event);
      return {
        color,
        weight: 3,
        opacity: 1,
        fillColor: color,
        fillOpacity: 0.1,
        dashArray: alertLevel(f?.properties?.event) === "danger" ? undefined : "8 5",
      };
    };
    const halo = L.geoJSON(features, {
      interactive: false,
      style: { color: "#fff", opacity: 0.55, weight: 5, fill: false },
    });
    const outline = L.geoJSON(features, {
      style,
      bubblingMouseEvents: false,
      attribution: noaaWarnings.length > 0 ? "Warnings: NWS" : undefined,
      onEachFeature: (f, layer) => {
        const path = layer as L.Path;
        path.on("mouseover", () => path.setStyle({ weight: 5 }));
        path.on("mouseout", () => path.setStyle(style(f as Feature<Geometry, NwsAlert>)));
        path.on("click", (e: L.LeafletMouseEvent) => {
          const here = shapes.filter((a) => containsPoint(a.geometry, e.latlng.lat, e.latlng.lng));
          const size = map.getSize();
          const popup = L.popup({
            maxWidth: 360,
            maxHeight: Math.max(160, size.y - 100),
            // Clear of the map's buttons along the top.
            autoPanPaddingTopLeft: [10, 50],
            className: "radar-alerts-popup",
          })
            .setLatLng(e.latlng)
            .openOn(map);
          withNwsText(here.length > 0 ? here : [f.properties as NwsAlert], (list, checking) => {
            // Only while this popup is still the one open.
            if (map.hasLayer(popup)) popup.setContent(alertsPopupContent(list, checking));
          });
        });
      },
    });
    alertsRef.current = L.layerGroup([halo, outline]).addTo(map);
  }, [alerts, noaaWarnings, showAlerts]);

  const outlined = alerts.filter((a) => a.geometry).length;
  const zoneOnly = alerts.length - outlined;
  const status = offline
    ? "Working offline — radar needs the internet"
    : error
      ? error
      : refused
        ? "NOAA's radar server is busy — trying again at the next refresh"
        : frames.length
          ? `${source === NATIONAL ? "" : `${source.toUpperCase()} · `}${frameLabel(frames[Math.min(index, frames.length - 1)])}`
          : loading
            ? "Loading radar…"
            : "No radar scans available";

  const sourceTitle =
    source === NATIONAL
      ? "NOAA's national radar mosaic; zoom in for a station's sharper radar"
      : `Radar station ${source.toUpperCase()}, sharper close in; zoom out for the national mosaic`;

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

  const opacityControl = (
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
  );

  const alertsControl = (
    <label className="checkbox-row" title="Outline the alerts here, and every storm warning in view">
      <input type="checkbox" checked={showAlerts} onChange={(e) => setShowAlerts(e.target.checked)} />
      Alerts
    </label>
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
        <span className="radar-time checkin-row-mono" aria-live="off" title={sourceTitle}>
          {status}
        </span>
        {opacityControl}
        {alertsControl}
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
            <span className="checkin-row-mono" title={sourceTitle}>
              {status}
            </span>
            {opacityControl}
            {alertsControl}
          </div>,
          containerRef.current
        )}
    </div>
  );
}
