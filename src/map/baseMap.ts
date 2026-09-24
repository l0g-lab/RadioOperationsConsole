import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cachingTileLayer } from "../offlineTileLayer";

// Standard OpenStreetMap tiles (CIMAP-071): free, no API key. A CartoDB
// dark-tile style was tried here and reverted — CartoDB's public tiles now
// require a key and silently return a rendered "API key required"
// placeholder image with an HTTP 200 status instead of an error code.
export const BASEMAP_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
/** For maps that plot ZIP-code-derived positions. */
export const ZIP_ATTRIBUTION =
  ' | Postal codes &copy; <a href="https://www.geonames.org">GeoNames</a>';

/** Continental-US overview, used when there's nothing to center on yet. */
export const DEFAULT_CENTER: [number, number] = [39.5, -98.35];
export const DEFAULT_ZOOM = 4;

/** A Leaflet map in `container` with the cached OpenStreetMap basemap already added. */
export function createBaseMap(
  container: HTMLElement,
  center: [number, number] = DEFAULT_CENTER,
  zoom: number = DEFAULT_ZOOM,
  attribution: string = BASEMAP_ATTRIBUTION
): L.Map {
  const map = L.map(container).setView(center, zoom);
  cachingTileLayer(BASEMAP_URL, { maxZoom: 19, attribution }).addTo(map);
  return map;
}
