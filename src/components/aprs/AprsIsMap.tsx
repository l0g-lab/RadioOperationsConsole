import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Station } from "../../aprs";
import { createBaseMap } from "../../map/baseMap";

interface Props {
  stations: Station[];
  centerLat: number;
  centerLon: number;
  radiusKm: number;
  /** The station picked in the list, shown larger with its details open. */
  selectedCall: string | null;
  onSelect: (call: string) => void;
}

function popupContentFor(s: Station): HTMLElement {
  const container = document.createElement("div");
  const callLine = document.createElement("strong");
  callLine.textContent = `${s.call} · ${s.kind.label}`;
  container.appendChild(callLine);
  if (s.comment) {
    const comment = document.createElement("div");
    comment.textContent = s.comment;
    container.appendChild(comment);
  }
  return container;
}

/**
 * The feed's stations on a map fitted to the chosen radius (APRSIS-023): one
 * marker each at its latest position, colored by kind (moving, fixed,
 * weather, infrastructure), labeled with its call sign, and a short trail
 * for one that's been moving.
 */
export default function AprsIsMap({ stations, centerLat, centerLon, radiusKm, selectedCall, onSelect }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const areaRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = createBaseMap(mapContainerRef.current, [centerLat, centerLon], 9);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The area: a faint circle at the radius, and the view fitted to it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    areaRef.current?.remove();
    areaRef.current = L.circle([centerLat, centerLon], {
      radius: radiusKm * 1000,
      className: "aprs-area",
      interactive: false,
    }).addTo(map);
    map.fitBounds(L.latLng(centerLat, centerLon).toBounds(radiusKm * 2000), { padding: [10, 10] });
  }, [centerLat, centerLon, radiusKm]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layersRef.current.forEach((l) => l.remove());
    layersRef.current = [];
    markersRef.current = new Map();

    for (const s of stations) {
      if (s.lat == null || s.lon == null) continue;
      if (s.trail.length > 1) {
        layersRef.current.push(
          L.polyline(s.trail, { className: `aprs-trail aprs-${s.kind.group}`, interactive: false }).addTo(map)
        );
      }
      const marker = L.circleMarker([s.lat, s.lon], {
        radius: s.call === selectedCall ? 9 : 6,
        className: `aprs-marker aprs-${s.kind.group}${s.call === selectedCall ? " aprs-selected" : ""}`,
      })
        .addTo(map)
        .bindPopup(popupContentFor(s))
        .bindTooltip(s.call, { permanent: true, direction: "right", offset: [8, 0], className: "aprs-label" });
      marker.on("click", () => onSelect(s.call));
      layersRef.current.push(marker);
      markersRef.current.set(s.call, marker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, selectedCall]);

  // Picking a station in the list finds it on the map.
  useEffect(() => {
    const map = mapRef.current;
    const marker = selectedCall ? markersRef.current.get(selectedCall) : undefined;
    if (!map || !marker) return;
    map.panTo(marker.getLatLng());
    marker.openPopup();
  }, [selectedCall]);

  return <div ref={mapContainerRef} className="leaflet-map-container aprs-map" />;
}
