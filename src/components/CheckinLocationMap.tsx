import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import type { Checkin } from "../types";
import { haversineKm, formatDistance } from "../geo";
import { BASEMAP_ATTRIBUTION, ZIP_ATTRIBUTION, createBaseMap } from "../map/baseMap";
import { spreadDuplicates } from "../map/spreadDuplicates";
import { MapPinned } from "lucide-react";
import { SIGNAL_COLORS, SIGNAL_REPORTS, stationKindLabel } from "../rangeCheck";

interface Props {
  checkins: Checkin[];
  operatorLat: number | null;
  operatorLon: number | null;
  operatorLabel: string;
  onClose: () => void;
  /**
   * A range check: the reference point is the repeater, and each station is
   * colored by how net control hears it, with a legend (RANGE-021).
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
}

const CHECKIN_MARKER_RADIUS = 5;
const CHECKIN_MARKER_COLOR = "#ff3b3b";
const CHECKIN_MARKER_STROKE = "#7a0000";

// Operator marker (CIMAP-061): same circle-marker style as check-ins, but a
// distinct color, so it reads as "one of these dots" rather than an
// unrelated icon.
const OPERATOR_MARKER_RADIUS = 6;
// Range-check stations are colored by signal, so a touch larger to read the color.
const RANGE_MARKER_RADIUS = 7;
const OPERATOR_MARKER_COLOR = "#2b8cff";
const OPERATOR_MARKER_STROKE = "#0a3d7a";

const DISTANCE_LINE_COLOR = "#7b2ff7";

function popupContentFor(
  pin: ResolvedPin,
  distanceKm: number | null,
  rangeCheck: boolean
): HTMLElement {
  const container = document.createElement("div");
  const callLine = document.createElement("strong");
  callLine.textContent = pin.name ? `${pin.callSign} (${pin.name})` : pin.callSign;
  container.appendChild(callLine);

  if (pin.label) {
    const locLine = document.createElement("div");
    locLine.textContent = pin.label;
    container.appendChild(locLine);
  }

  const line = (text: string) => {
    const el = document.createElement("div");
    el.textContent = text;
    container.appendChild(el);
  };

  if (rangeCheck) {
    if (pin.weHear) line(`We hear them: ${pin.weHear}`);
    if (pin.theyHear) line(`They hear the repeater: ${pin.theyHear}`);
    const station = [pin.kind && stationKindLabel(pin.kind), pin.power].filter(Boolean).join(" · ");
    if (station) line(station);
  }

  if (distanceKm != null) {
    line(`Distance to ${rangeCheck ? "repeater" : "operator"}: ${formatDistance(distanceKm)}`);
  }

  return container;
}

function operatorPopupContent(label: string, rangeCheck: boolean): HTMLElement {
  const container = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = rangeCheck ? "Repeater" : "Operator";
  container.appendChild(title);
  const labelLine = document.createElement("div");
  labelLine.textContent = label;
  container.appendChild(labelLine);
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
  operatorLat,
  operatorLon,
  operatorLabel,
  onClose,
  rangeCheck = false,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Layer[]>([]);
  const operatorMarkerRef = useRef<L.CircleMarker | null>(null);
  const hasOperatorLocation = operatorLat != null && operatorLon != null;

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

  const pins = useMemo<ResolvedPin[]>(() => {
    const resolved: ResolvedPin[] = [];
    for (const c of checkins) {
      if (c.location_lat == null || c.location_lon == null) continue;
      resolved.push({
        checkinId: c.id,
        callSign: c.call_sign.toUpperCase(),
        name: c.name,
        lat: c.location_lat,
        lon: c.location_lon,
        label: rangeCheck ? c.cross_street || c.location_label : c.location_label,
        weHear: c.rst_sent,
        theyHear: c.rst_received,
        kind: c.station_kind,
        power: c.power,
      });
    }
    return resolved;
  }, [checkins, rangeCheck]);

  const unresolvedCount = checkins.length - pins.length;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    operatorMarkerRef.current?.remove();
    operatorMarkerRef.current = null;

    const plottedPins = spreadDuplicates(pins, (p) => p).map((s) => ({
      ...s.item,
      lat: s.lat,
      lon: s.lon,
    }));

    for (const pin of plottedPins) {
      const distanceKm = hasOperatorLocation
        ? haversineKm(pin.lat, pin.lon, operatorLat as number, operatorLon as number)
        : null;

      const signal = rangeCheck ? SIGNAL_COLORS[pin.weHear] : undefined;
      const marker = L.circleMarker([pin.lat, pin.lon], {
        radius: rangeCheck ? RANGE_MARKER_RADIUS : CHECKIN_MARKER_RADIUS,
        color: signal?.stroke ?? CHECKIN_MARKER_STROKE,
        weight: 2,
        fillColor: signal?.fill ?? CHECKIN_MARKER_COLOR,
        fillOpacity: 0.9,
      }).addTo(map);
      marker.bindPopup(popupContentFor(pin, distanceKm, rangeCheck));
      markersRef.current.push(marker);

      if (hasOperatorLocation) {
        const line = L.polyline(
          [
            [pin.lat, pin.lon],
            [operatorLat as number, operatorLon as number],
          ],
          {
            color: DISTANCE_LINE_COLOR,
            weight: 2,
            opacity: 0.85,
            dashArray: "4,6",
          }
        ).addTo(map);
        line.bindTooltip(formatDistance(distanceKm as number));
        markersRef.current.push(line);
      }
    }

    if (hasOperatorLocation) {
      const marker = L.circleMarker([operatorLat as number, operatorLon as number], {
        radius: OPERATOR_MARKER_RADIUS,
        color: OPERATOR_MARKER_STROKE,
        weight: 2,
        fillColor: OPERATOR_MARKER_COLOR,
        fillOpacity: 0.9,
      }).addTo(map);
      marker.bindPopup(operatorPopupContent(operatorLabel, rangeCheck));
      operatorMarkerRef.current = marker;
    }

    const boundsPoints: [number, number][] = plottedPins.map((p) => [p.lat, p.lon]);
    if (hasOperatorLocation) boundsPoints.push([operatorLat as number, operatorLon as number]);
    if (boundsPoints.length > 0) {
      map.fitBounds(L.latLngBounds(boundsPoints).pad(0.2));
    }
  }, [pins, hasOperatorLocation, operatorLat, operatorLon, operatorLabel, rangeCheck]);

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
          {pins.length} of {checkins.length} check-ins plotted
          {unresolvedCount > 0 && ` — ${unresolvedCount} without a resolvable location`}
          {!hasOperatorLocation &&
            (rangeCheck ? " — no repeater location set" : " — no operator location set")}
        </p>
        {rangeCheck && (
          <ul className="range-map-legend" aria-label="How we hear them">
            {SIGNAL_REPORTS.map((r) => (
              <li key={r}>
                <span
                  className="range-map-swatch"
                  style={{ background: SIGNAL_COLORS[r].fill, borderColor: SIGNAL_COLORS[r].stroke }}
                />
                {r}
              </li>
            ))}
            <li>
              <span
                className="range-map-swatch"
                style={{ background: OPERATOR_MARKER_COLOR, borderColor: OPERATOR_MARKER_STROKE }}
              />
              Repeater
            </li>
          </ul>
        )}
        <div ref={mapContainerRef} className="leaflet-map-container" />
      </div>
    </div>
  );
}
