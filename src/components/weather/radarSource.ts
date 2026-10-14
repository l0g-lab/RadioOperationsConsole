/**
 * Which radar the map shows, and the pictures to ask NOAA for: NOAA's
 * quality-controlled national mosaic, or a station's super-resolution scans
 * where the operator picks one (RADAR-016, RADAR-020).
 */
import { RADAR_STATIONS } from "./radarStations";
import { kmToMiles } from "../../geo";

/** "conus" for the national mosaic, else a station's id ("kevx"). */
export type RadarSource = string;
export const NATIONAL: RadarSource = "conus";

/**
 * How far from the area a station can be and still be offered: about as far
 * as its lowest scan still sees rain near the ground.
 */
export const STATION_RANGE_KM = 300;
/** The most stations offered, nearest first. */
const MAX_STATIONS = 4;

/** Distance in km between two points (haversine). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export interface NearbyStation {
  id: string;
  name: string;
  km: number;
}

/** The stations near a point that can be picked instead of the national mosaic, nearest first. */
export function nearbyStations(lat: number, lon: number): NearbyStation[] {
  return RADAR_STATIONS.map(([id, sLat, sLon, name]) => ({ id, name, km: distanceKm(lat, lon, sLat, sLon) }))
    .filter((s) => s.km <= STATION_RANGE_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_STATIONS);
}

/** "KAMX Miami · 7 mi", in miles like the rest of the app's distances. */
export function stationLabel(s: NearbyStation): string {
  return `${s.id.toUpperCase()} ${s.name} · ${Math.round(kmToMiles(s.km))} mi`;
}

/** The WMS a source is served from, and its layer. */
function wmsFor(source: RadarSource): { url: string; layer: string } {
  return source === NATIONAL
    ? { url: "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows", layer: "conus_bref_qcd" }
    : { url: `https://opengeo.ncep.noaa.gov/geoserver/${source}/ows`, layer: `${source}_sr_bref` };
}

type Bbox = [number, number, number, number];

/** NOAA's largest picture is 4096 pixels a side. */
const MAX_SIDE = 4096;

/**
 * One radar picture of exactly what the map shows (RADAR-016): a WMS GetMap
 * for the map's bounds in web-Mercator meters, for one scan — one request per
 * scan instead of a dozen tiles. `pixelRatio` is the screen's, so it's as
 * sharp as the screen shows it rather than blown up.
 */
export function radarImageUrl(
  source: RadarSource,
  time: string,
  bbox: Bbox,
  width: number,
  height: number,
  pixelRatio = 1
): string {
  const { url, layer } = wmsFor(source);
  const scale = Math.min(Math.max(pixelRatio, 1), MAX_SIDE / Math.max(width, height, 1));
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layer,
    STYLES: "",
    FORMAT: "image/png",
    TRANSPARENT: "true",
    CRS: "EPSG:3857",
    WIDTH: String(Math.round(width * scale)),
    HEIGHT: String(Math.round(height * scale)),
    BBOX: bbox.map((n) => n.toFixed(1)).join(","),
    TIME: time,
  });
  return `${url}?${params}`;
}

/**
 * Scan times to ask for when NOAA's list of scans can't be had: the last
 * hour, oldest first — every two minutes for the national mosaic, every five
 * for a station. The server answers each with its nearest scan (the layers'
 * time dimension is "nearestValue"), so the radar still works if that one
 * request is refused (RADAR-015).
 */
export function fallbackFrameTimes(source: RadarSource = NATIONAL, now = new Date()): string[] {
  const minutes = source === NATIONAL ? 2 : 5;
  const count = 60 / minutes;
  const step = minutes * 60_000;
  const end = Math.floor(now.getTime() / step) * step;
  return Array.from({ length: count }, (_, i) => new Date(end - (count - 1 - i) * step).toISOString());
}

/**
 * How long each scan shows: the hour's loop takes about ten seconds whether
 * it's the national mosaic's ~30 scans or a station's ~10, within limits.
 */
export function frameMs(count: number): number {
  return Math.min(800, Math.max(330, Math.round(10_000 / Math.max(count, 1))));
}
