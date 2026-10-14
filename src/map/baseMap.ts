import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { addExpandControl } from "./expandControl";
import { addBasemapWithStyleControl } from "./styleControl";

/** For maps that plot ZIP-code-derived positions. */
export const ZIP_ATTRIBUTION =
  ' | Postal codes &copy; <a href="https://www.geonames.org">GeoNames</a>';

/** Continental-US overview, used when there's nothing to center on yet. */
export const DEFAULT_CENTER: [number, number] = [39.5, -98.35];
export const DEFAULT_ZOOM = 4;

/**
 * A Leaflet map in `container` with the cached basemap in the remembered
 * style, the "Map style" picker and the "Full view" button already added.
 * `extraAttribution` credits anything else the map shows.
 */
export function createBaseMap(
  container: HTMLElement,
  center: [number, number] = DEFAULT_CENTER,
  zoom: number = DEFAULT_ZOOM,
  extraAttribution = ""
): L.Map {
  const map = L.map(container).setView(center, zoom);
  addExpandControl(map);
  addBasemapWithStyleControl(map, extraAttribution);
  return map;
}
