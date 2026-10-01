import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import type { SpotterReport } from "../../types";
import { HAZARD_TYPES } from "../../types";
import { formatCoords } from "../../geo";
import { createBaseMap } from "../../map/baseMap";
import { spreadDuplicates } from "../../map/spreadDuplicates";
import { hazardIconSvg } from "./hazardIcons";
import { MapPinned } from "lucide-react";

interface Props {
  reports: SpotterReport[];
  selectedReportId: string | null;
  onClose: () => void;
}

const ICON_SIZE = 32;

function line(container: HTMLElement, text: string, strong = false) {
  const el = document.createElement(strong ? "strong" : "div");
  el.textContent = text;
  container.appendChild(el);
}

function popupFor(r: SpotterReport): HTMLElement {
  const box = document.createElement("div");
  line(box, r.magnitude ? `${r.hazard_type} — ${r.magnitude}` : r.hazard_type, true);
  line(box, r.reported_at.replace("T", " "));
  if (r.location_text) line(box, r.location_text);
  if (r.county) line(box, r.county);
  line(box, formatCoords(r.lat as number, r.lon as number));
  if (r.reporter) line(box, `Reported by ${r.reporter}`);
  if (r.notes) line(box, r.notes);
  return box;
}

/**
 * Plots each spotter report at the location of the hazard itself (the
 * report's own lat/lon — where the damage or weather was observed), not at
 * the reporting station or the operator who logged it. Reports with no
 * location set are left off the map and counted in the status line.
 */
export default function SpotterReportMap({ reports, selectedReportId, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markerById = useRef(new Map<string, L.Marker>());

  const located = useMemo(() => reports.filter((r) => r.lat != null && r.lon != null), [reports]);
  const typesShown = HAZARD_TYPES.filter((t) => located.some((r) => r.hazard_type === t));
  const otherShown = located.some(
    (r) => !(HAZARD_TYPES as readonly string[]).includes(r.hazard_type)
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = createBaseMap(containerRef.current);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markerById.current.clear();
    // Reports at the same spot (say hail and wind at one intersection) are
    // fanned into a small ring so none hides another.
    const plotted = spreadDuplicates(
      located,
      (r) => ({ lat: r.lat as number, lon: r.lon as number }),
      0.004
    ).map((s) => ({ report: s.item, lat: s.lat, lon: s.lon }));
    for (const p of plotted) {
      const icon = L.divIcon({
        className: "spotter-map-icon",
        html: hazardIconSvg(p.report.hazard_type, ICON_SIZE),
        iconSize: [ICON_SIZE, ICON_SIZE],
        iconAnchor: [ICON_SIZE / 2, ICON_SIZE / 2],
        popupAnchor: [0, -ICON_SIZE / 2],
      });
      const marker = L.marker([p.lat, p.lon], {
        icon,
        title: p.report.hazard_type,
      })
        .bindPopup(popupFor(p.report))
        .addTo(layer);
      markerById.current.set(p.report.id, marker);
    }
    if (plotted.length > 0) {
      map.fitBounds(
        L.latLngBounds(plotted.map((p) => [p.lat, p.lon] as [number, number])).pad(0.3),
        {
          maxZoom: 12,
        }
      );
    }
  }, [located]);

  // Opening the map with a report selected in the list jumps to that one.
  useEffect(() => {
    if (!selectedReportId) return;
    markerById.current.get(selectedReportId)?.openPopup();
  }, [selectedReportId, located]);

  const missing = reports.length - located.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel checkin-map-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><MapPinned className="heading-icon" />Spotter Report Locations</h3>
          <button onClick={onClose}>Close</button>
        </div>
        <p className="leaflet-map-status">
          {located.length} of {reports.length} reports plotted at the location of the hazard
          {missing > 0 && ` — ${missing} without a location`}
        </p>
        <div ref={containerRef} className="leaflet-map-container" />
        {(typesShown.length > 0 || otherShown) && (
          <div className="spotter-map-legend">
            {[...typesShown, ...(otherShown && !typesShown.includes("Other") ? ["Other"] : [])].map(
              (t) => (
                <span key={t} className="spotter-map-legend-item">
                  <span
                    className="spotter-map-legend-icon"
                    dangerouslySetInnerHTML={{ __html: hazardIconSvg(t, 20) }}
                  />
                  {t}
                </span>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
