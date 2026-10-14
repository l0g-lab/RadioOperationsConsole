import L from "leaflet";
import { cachingTileLayer } from "../offlineTileLayer";

export type MapStyle = "street" | "dark" | "satellite";

const KEY = "roc-map-style";

/** Fired on window when the style is changed on any map, so every open map follows. */
const CHANGE_EVENT = "roc-map-style-change";

const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// USGS imagery with roads, street names and places drawn on top: public
// domain, no API key, US only. Its tiles stop at zoom 16; Leaflet stretches
// them one step further, but no more — past that the picture and its labels
// are too blown up to read, so a map closer in zooms out to 17 on switching. Esri's imagery is sharper but its
// terms want an account — the CartoDB problem again (CIMAP-071).
const USGS_URL =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}";
const USGS_ATTRIBUTION = 'Imagery <a href="https://www.usgs.gov/the-national-map">USGS The National Map</a>';

// Lucide "map", "moon" and "earth", inlined like the Full view button's.
const SVG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const STREET_ICON = `<svg ${SVG_ATTRS}><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>`;
const DARK_ICON = `<svg ${SVG_ATTRS}><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>`;
const SATELLITE_ICON = `<svg ${SVG_ATTRS}><path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"/><path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17"/><path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"/><circle cx="12" cy="12" r="10"/></svg>`;

export const MAP_STYLES: { value: MapStyle; label: string; icon: string; title: string }[] = [
  { value: "street", label: "Street", icon: STREET_ICON, title: "The normal street map" },
  { value: "dark", label: "Dark", icon: DARK_ICON, title: "The street map, darkened for a dark room" },
  { value: "satellite", label: "Satellite", icon: SATELLITE_ICON, title: "Aerial imagery with street names (US only)" },
];

export function getMapStyle(): MapStyle {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "satellite") return v;
  } catch {
    // Storage unavailable: the normal street map.
  }
  return "street";
}

export function setMapStyle(style: MapStyle) {
  try {
    if (style === "street") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, style);
  } catch {
    // Still applies to the maps open now.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: style }));
}

/**
 * The basemap tiles for `style`. Dark is the street map with its colors
 * turned around in CSS, so it needs no other tile server (CartoDB's dark
 * tiles were tried and now need a key, CIMAP-071) and shares the street
 * map's saved tiles offline.
 */
export function basemapLayer(style: MapStyle, extraAttribution = ""): L.TileLayer {
  if (style === "satellite") {
    return cachingTileLayer(USGS_URL, {
      maxZoom: 17,
      maxNativeZoom: 16,
      attribution: USGS_ATTRIBUTION + extraAttribution,
    });
  }
  return cachingTileLayer(OSM_URL, {
    maxZoom: 19,
    attribution: OSM_ATTRIBUTION + extraAttribution,
    className: style === "dark" ? "basemap-dark" : "",
  });
}

/**
 * Puts the basemap on `map` in the remembered style, with Street / Dark /
 * Satellite buttons beside Full view that change it — on this map and every
 * other open one — and remember it on this computer.
 */
export function addBasemapWithStyleControl(map: L.Map, extraAttribution = ""): L.Control {
  let style = getMapStyle();
  let layer = basemapLayer(style, extraAttribution).addTo(map);
  const buttons = new Map<MapStyle, HTMLButtonElement>();

  const render = () => {
    for (const [value, button] of buttons) button.setAttribute("aria-pressed", String(value === style));
  };

  const apply = (next: MapStyle) => {
    if (next === style) return;
    style = next;
    map.removeLayer(layer);
    layer = basemapLayer(style, extraAttribution).addTo(map);
    render();
  };

  const onChange = (e: Event) => apply((e as CustomEvent<MapStyle>).detail);

  const Control = L.Control.extend({
    onAdd() {
      const wrap = L.DomUtil.create("div", "leaflet-bar map-style-control");
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-label", "Map style");
      for (const { value, label, icon, title } of MAP_STYLES) {
        const button = L.DomUtil.create("button", "map-style-button", wrap);
        button.type = "button";
        button.title = title;
        // Icon plus a text label: icons alone aren't enough (UX-007).
        button.innerHTML = `${icon}<span>${label}</span>`;
        L.DomEvent.on(button, "click", (e) => {
          L.DomEvent.stop(e);
          setMapStyle(value);
        });
        buttons.set(value, button);
      }
      render();
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);
      window.addEventListener(CHANGE_EVENT, onChange);
      return wrap;
    },
    // Also called by map.remove().
    onRemove() {
      window.removeEventListener(CHANGE_EVENT, onChange);
    },
  });

  return new Control({ position: "topright" }).addTo(map);
}
