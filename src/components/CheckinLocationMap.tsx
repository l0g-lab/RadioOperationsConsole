import { useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import type { Checkin } from "../types";
import { haversineKm, formatDistance } from "../geo";
import { BASEMAP_ATTRIBUTION, ZIP_ATTRIBUTION, createBaseMap } from "../map/baseMap";
import { spreadDuplicates } from "../map/spreadDuplicates";
import { MapPinned, Radio, RadioTower } from "lucide-react";
import type { MapPoint } from "../mapPoints";
import { SIGNAL_COLORS, SIGNAL_REPORTS, stationKindLabel } from "../rangeCheck";
import { howText, isApproximate } from "../placeText";

type Place = MapPoint;

interface Props {
  checkins: Checkin[];
  /** Where net control is: the activity's location, else the operator's. */
  netControl: Place | null;
  /** The repeater the activity runs on, if any (RPT-021). */
  repeater?: Place | null;
  onClose: () => void;
  /**
   * A range check: each station is colored by how net control hears it, with
   * a legend (RANGE-021).
   */
  rangeCheck?: boolean;
}

interface ResolvedPin {
  checkinId: string;
  callSign: string;
  name: string;
  lat: number;
  lon: number;
  label: string;
  /** Range check only: how we hear them, how they hear the repeater, station type, power. */
  weHear: string;
  theyHear: string;
  kind: string;
  power: string;
  /** How the point was arrived at (LOCRES-064); approximate ones are drawn hollow. */
  how: string;
}

const CHECKIN_MARKER_RADIUS = 5;
const CHECKIN_MARKER_COLOR = "#ff3b3b";
const CHECKIN_MARKER_STROKE = "#7a0000";
// Range-check stations are colored by signal, so a touch larger to read the color.
const RANGE_MARKER_RADIUS = 7;

// Lines from the reference point (the repeater, else net control) to each
// check-in, and from net control to the repeater, in different colors (RPT-031).
const STATION_LINE_COLOR = "#7b2ff7";
const LINK_LINE_COLOR = "#ff8c1a";

/** An icon's SVG markup, rendered into a detached element. */
function iconSvg(Icon: typeof Radio): string {
  const holder = document.createElement("div");
  const root = createRoot(holder);
  flushSync(() => root.render(<Icon size={13} strokeWidth={2.25} aria-hidden />));
  const svg = holder.innerHTML;
  root.unmount();
  return svg;
}

// Rendered once, when this module loads: flushSync can't render from inside
// the map's effect, and react-dom/server would add ~80 kB for two icons.
export const MARKER_SVG = {
  repeater: iconSvg(RadioTower),
  "net-control": iconSvg(Radio),
};

/**
 * A map marker drawn from an icon, in a round badge so it stands apart from
 * the check-in dots in both themes (RPT-030).
 */
function iconMarker(kind: "repeater" | "net-control"): L.DivIcon {
  return L.divIcon({
    className: `map-icon map-icon-${kind}`,
    html: MARKER_SVG[kind],
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -10],
  });
}

/** The same spot: equal to about a metre, so one pin isn't split by rounding. */
const spotKey = (lat: number, lon: number) => `${lat.toFixed(5)},${lon.toFixed(5)}`;

/**
 * The pins for a map: one per station per spot (CIMAP-090). A station entered
 * again at the same place (new traffic, a report) is one pin, showing its
 * latest entry; one that has moved gets a pin at each place. A range check
 * plots every entry, since each is a signal report from where it was made.
 */
export function mapPins(checkins: Checkin[], rangeCheck: boolean): { pins: ResolvedPin[]; stations: number; placed: number } {
  const newestFirst = [...checkins].sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at));
  const pins: ResolvedPin[] = [];
  const seen = new Set<string>();
  const stations = new Set<string>();
  const placed = new Set<string>();
  for (const c of newestFirst) {
    const call = c.call_sign.toUpperCase();
    stations.add(rangeCheck ? c.id : call);
    if (c.location_lat == null || c.location_lon == null) continue;
    placed.add(rangeCheck ? c.id : call);
    const key = `${call}|${spotKey(c.location_lat, c.location_lon)}`;
    if (!rangeCheck && seen.has(key)) continue;
    seen.add(key);
    pins.push({
      checkinId: c.id,
      callSign: call,
      name: c.name,
      lat: c.location_lat,
      lon: c.location_lon,
      label: rangeCheck ? c.cross_street || c.location_label : c.location_label,
      weHear: c.rst_sent,
      theyHear: c.rst_received,
      kind: c.station_kind,
      power: c.power,
      how: c.location_how,
    });
  }
  return { pins: pins.reverse(), stations: stations.size, placed: placed.size };
}

function popupContentFor(
  pin: ResolvedPin,
  distance: { km: number; to: string } | null,
  rangeCheck: boolean
): HTMLElement {
  const container = document.createElement("div");
  const callLine = document.createElement("strong");
  callLine.textContent = pin.name ? `${pin.callSign} (${pin.name})` : pin.callSign;
  container.appendChild(callLine);

  const line = (text: string) => {
    const el = document.createElement("div");
    el.textContent = text;
    container.appendChild(el);
  };

  if (pin.label) line(pin.label);
  if (rangeCheck) {
    if (pin.weHear) line(`We hear them: ${pin.weHear}`);
    if (pin.theyHear) line(`They hear the repeater: ${pin.theyHear}`);
    const station = [pin.kind && stationKindLabel(pin.kind), pin.power].filter(Boolean).join(" · ");
    if (station) line(station);
  }
  if (distance) line(`Distance to ${distance.to}: ${formatDistance(distance.km)}`);
  if (howText(pin.how)) line(howText(pin.how));
  return container;
}

function placePopupContent(title: string, label: string): HTMLElement {
  const container = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = title;
  container.appendChild(heading);
  if (label) {
    const labelLine = document.createElement("div");
    labelLine.textContent = label;
    container.appendChild(labelLine);
  }
  return container;
}

/**
 * Plots each check-in's already-resolved `location_lat`/`location_lon`
 * (set once at save time — auto-resolved offline-first, or a manual pin via
 * "Edit location" — see locationResolution.ts) rather than re-deriving a
 * position from qth_location/grid_square/address on every render. A
 * check-in with no resolved location yet (e.g. created before enough
 * directory data was on hand) is simply omitted, same as before.
 */
export default function CheckinLocationMap({
  checkins,
  netControl,
  repeater = null,
  onClose,
  rangeCheck = false,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = createBaseMap(
      mapContainerRef.current,
      undefined,
      undefined,
      BASEMAP_ATTRIBUTION + ZIP_ATTRIBUTION
    );
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const { pins, stations, placed } = useMemo(() => mapPins(checkins, rangeCheck), [checkins, rangeCheck]);
  const unresolvedCount = stations - placed;
  // Distances and station lines run from the repeater when there is one (RPT-031).
  const from = repeater ?? netControl;
  const fromName = repeater ? "repeater" : "net control";

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.forEach((m) => m.remove());
    layersRef.current = [];
    const add = <T extends L.Layer>(layer: T) => {
      layer.addTo(map);
      layersRef.current.push(layer);
      return layer;
    };

    const plottedPins = spreadDuplicates(pins, (p) => p).map((s) => ({
      ...s.item,
      lat: s.lat,
      lon: s.lon,
    }));

    for (const pin of plottedPins) {
      const distanceKm = from ? haversineKm(pin.lat, pin.lon, from.lat, from.lon) : null;
      const signal = rangeCheck ? SIGNAL_COLORS[pin.weHear] : undefined;

      if (from && distanceKm != null) {
        add(
          L.polyline(
            [
              [from.lat, from.lon],
              [pin.lat, pin.lon],
            ],
            { color: STATION_LINE_COLOR, weight: 2, opacity: 0.85, dashArray: "4,6" }
          )
        ).bindTooltip(formatDistance(distanceKm));
      }
      // Only roughly placed (a ZIP's or town's centre…): hollow and dashed,
      // so it isn't read as where the station really is (LOCRES-064).
      const rough = isApproximate(pin.how);
      add(
        L.circleMarker([pin.lat, pin.lon], {
          radius: (rangeCheck ? RANGE_MARKER_RADIUS : CHECKIN_MARKER_RADIUS) + (rough ? 1 : 0),
          color: signal?.stroke ?? CHECKIN_MARKER_STROKE,
          weight: 2,
          dashArray: rough ? "3,3" : undefined,
          fillColor: signal?.fill ?? CHECKIN_MARKER_COLOR,
          fillOpacity: rough ? 0.15 : 0.9,
        })
      ).bindPopup(
        popupContentFor(pin, distanceKm != null ? { km: distanceKm, to: fromName } : null, rangeCheck)
      );
    }

    if (repeater && netControl) {
      const km = haversineKm(netControl.lat, netControl.lon, repeater.lat, repeater.lon);
      add(
        L.polyline(
          [
            [netControl.lat, netControl.lon],
            [repeater.lat, repeater.lon],
          ],
          { color: LINK_LINE_COLOR, weight: 3, opacity: 0.9 }
        )
      ).bindTooltip(`Net control to repeater: ${formatDistance(km)}`);
    }
    if (netControl) {
      add(L.marker([netControl.lat, netControl.lon], { icon: iconMarker("net-control"), title: "Net control" }))
        .bindPopup(placePopupContent("Net control", netControl.label));
    }
    if (repeater) {
      add(L.marker([repeater.lat, repeater.lon], { icon: iconMarker("repeater"), title: "Repeater" }))
        .bindPopup(placePopupContent("Repeater", repeater.label));
    }

    const boundsPoints: [number, number][] = plottedPins.map((p) => [p.lat, p.lon]);
    if (netControl) boundsPoints.push([netControl.lat, netControl.lon]);
    if (repeater) boundsPoints.push([repeater.lat, repeater.lon]);
    if (boundsPoints.length > 0) {
      map.fitBounds(L.latLngBounds(boundsPoints).pad(0.2));
    }
  }, [pins, netControl, repeater, from, fromName, rangeCheck]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel checkin-map-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <MapPinned className="heading-icon" />
            {rangeCheck ? "Range Check Map" : "Check-in Locations"}
          </h3>
          <button onClick={onClose}>Close</button>
        </div>
        <p className="leaflet-map-status">
          {rangeCheck
            ? `${placed} of ${stations} check-ins plotted`
            : `${placed} of ${stations} ${stations === 1 ? "station" : "stations"} plotted`}
          {unresolvedCount > 0 && ` — ${unresolvedCount} without a resolvable location`}
          {rangeCheck && !repeater && " — no repeater set"}
          {!rangeCheck && !from && " — no repeater or net control location set"}
        </p>
        <ul className="range-map-legend" aria-label="Map key">
          {rangeCheck &&
            SIGNAL_REPORTS.map((r) => (
              <li key={r}>
                <span
                  className="range-map-swatch"
                  style={{ background: SIGNAL_COLORS[r].fill, borderColor: SIGNAL_COLORS[r].stroke }}
                />
                {r}
              </li>
            ))}
          {repeater && (
            <li>
              <span className="map-icon map-icon-repeater map-icon-legend">
                <RadioTower size={10} aria-hidden />
              </span>
              Repeater
            </li>
          )}
          {netControl && (
            <li>
              <span className="map-icon map-icon-net-control map-icon-legend">
                <Radio size={10} aria-hidden />
              </span>
              Net control
            </li>
          )}
          {from && pins.length > 0 && (
            <li>
              <span className="map-line-swatch map-line-swatch-dashed" style={{ borderColor: STATION_LINE_COLOR }} />
              Station to {fromName}
            </li>
          )}
          {repeater && netControl && (
            <li>
              <span className="map-line-swatch" style={{ borderColor: LINK_LINE_COLOR }} />
              Net control to repeater
            </li>
          )}
          {pins.some((p) => isApproximate(p.how)) && (
            <li>
              <span
                className="range-map-swatch range-map-swatch-approx"
                style={{ borderColor: CHECKIN_MARKER_STROKE, background: "transparent" }}
              />
              Approximate location
            </li>
          )}
        </ul>
        <div ref={mapContainerRef} className="leaflet-map-container" />
      </div>
    </div>
  );
}
