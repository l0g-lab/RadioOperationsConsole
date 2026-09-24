import { useEffect, useRef } from "react";
import L from "leaflet";
import type { AprsIsPacket } from "../../types";
import { createBaseMap } from "../../map/baseMap";

interface Props {
  packets: AprsIsPacket[];
  centerLat: number;
  centerLon: number;
}

const DEFAULT_ZOOM = 8;

const PACKET_MARKER_RADIUS = 5;
const PACKET_MARKER_COLOR = "#2ecc71";
const PACKET_MARKER_STROKE = "#0f6b34";

function popupContentFor(p: AprsIsPacket): HTMLElement {
  const container = document.createElement("div");
  const callLine = document.createElement("strong");
  callLine.textContent = p.source;
  container.appendChild(callLine);

  const heardLine = document.createElement("div");
  heardLine.textContent = `Heard: ${new Date(p.received_at).toLocaleTimeString()}`;
  container.appendChild(heardLine);

  if (p.comment) {
    const commentLine = document.createElement("em");
    commentLine.textContent = p.comment;
    container.appendChild(commentLine);
  }
  return container;
}

/** Plots the subset of a live APRS-IS feed that has a decoded position. */
export default function AprsIsMap({ packets, centerLat, centerLon }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Layer[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = createBaseMap(mapContainerRef.current, [centerLat, centerLon], DEFAULT_ZOOM);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const p of packets) {
      if (p.lat == null || p.lon == null) continue;
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: PACKET_MARKER_RADIUS,
        color: PACKET_MARKER_STROKE,
        weight: 2,
        fillColor: PACKET_MARKER_COLOR,
        fillOpacity: 0.9,
      }).addTo(map);
      marker.bindPopup(popupContentFor(p));
      markersRef.current.push(marker);
    }
  }, [packets]);

  return <div ref={mapContainerRef} className="leaflet-map-container" />;
}
