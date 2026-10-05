/**
 * A check-in's one Location box (CIMAP-080): whatever was typed — an address,
 * town, ZIP, cross street, mile marker, grid square, or GPS coordinates — or
 * what a call-sign lookup found, sorted into the separate fields a check-in
 * keeps (address, QTH, grid square, map position), so nothing is lost while
 * the form asks for one thing.
 */
import * as api from "./api";
import { parseCoords } from "./geo";
import { gridSquareToLatLon, latLonToGridSquare } from "./grid";
import { resolveOfflineLocationAsync } from "./locationResolution";

/** What a call-sign lookup found, held until saving. */
export interface LookupLocation {
  /** The text it put in the box (its address, else its QTH), to tell whether the box was changed. */
  text: string;
  qth: string | null;
  grid: string | null;
  exact: { lat: number; lon: number } | null;
}

/** How the map position was arrived at. */
export type PlacedBy =
  | "pin" // dropped on the map
  | "coords" // typed GPS coordinates
  | "mile_marker"
  | "qrz" // the call-sign lookup's exact point
  | "online" // the online map search
  | "zip" // a ZIP code's centre
  | "grid" // a grid square's centre
  | null;

export interface CheckinLocation {
  address: string | null;
  qth: string | null;
  grid: string | null;
  lat: number | null;
  lon: number | null;
  /** What the map point is called. */
  label: string | null;
  /** Placed by hand (pin, coordinates, mile marker): left alone by later lookups. */
  manual: boolean;
  placedBy: PlacedBy;
  /** Only roughly placed (a ZIP or grid centre). */
  approx: boolean;
  /** Where it lands, in words, e.g. "the centre of ZIP 32817". */
  note: string;
}

/** A Maidenhead grid square typed on its own, e.g. "EL98" or "el98hm". */
export function asGridSquare(text: string): string | null {
  const t = text.trim();
  return /^[A-Ra-r]{2}\d{2}([A-Xa-x]{2})?$/.test(t)
    ? t.slice(0, 2).toUpperCase() + t.slice(2, 4) + t.slice(4).toLowerCase()
    : null;
}

const NOTES: Record<Exclude<PlacedBy, null>, string> = {
  pin: "the spot picked on the map",
  coords: "the coordinates typed",
  mile_marker: "the mile marker",
  qrz: "QRZ's exact point for this station",
  online: "found by the online map search",
  zip: "the centre of the ZIP code — approximate",
  grid: "the centre of the grid square — approximate",
};

/**
 * Sorts the Location box into a check-in's fields. Best first: a pin dropped
 * on the map; typed coordinates; a mile marker; a grid square typed on its own;
 * the lookup's exact point (if the box still holds what it found); the online
 * map search (only when `online`); a ZIP code's centre; the lookup's grid
 * square. A grid square is worked out from the position when there isn't one.
 */
export async function resolveCheckinLocation(
  text: string,
  {
    lookup = null,
    pin = null,
    online = false,
  }: {
    lookup?: LookupLocation | null;
    pin?: { lat: number; lon: number; label: string } | null;
    /** Try the online map search for text the offline data can't place. */
    online?: boolean;
  } = {}
): Promise<CheckinLocation> {
  const typed = text.trim();
  const fromLookup = lookup != null && typed === lookup.text.trim();
  const base = {
    address: typed && !asGridSquare(typed) && !parseCoords(typed) ? typed : null,
    qth: fromLookup ? lookup.qth : null,
  };
  const place = (
    lat: number,
    lon: number,
    placedBy: Exclude<PlacedBy, null>,
    extra: Partial<CheckinLocation> = {}
  ): CheckinLocation => ({
    ...base,
    grid: (fromLookup && lookup.grid) || latLonToGridSquare(lat, lon),
    lat,
    lon,
    label: typed || null,
    manual: placedBy === "pin" || placedBy === "coords" || placedBy === "mile_marker",
    placedBy,
    approx: placedBy === "zip" || placedBy === "grid",
    note: NOTES[placedBy],
    ...extra,
  });

  if (pin) return place(pin.lat, pin.lon, "pin", { label: pin.label || typed || null });

  const coords = parseCoords(typed);
  if (coords) return place(coords.lat, coords.lon, "coords");

  const grid = asGridSquare(typed);
  if (grid) {
    const c = gridSquareToLatLon(grid);
    if (c) return place(c.lat, c.lon, "grid", { grid, note: `the centre of grid square ${grid} — approximate` });
  }

  if (typed) {
    const mile = await api.resolveMileMarker(typed).catch(() => null);
    if (mile) return place(mile.lat, mile.lon, "mile_marker", { label: mile.label, note: mile.label });
  }

  if (fromLookup && lookup.exact) return place(lookup.exact.lat, lookup.exact.lon, "qrz");

  if (online && typed) {
    const found = await api.geocodeLocation(typed).catch(() => null);
    if (found) return place(found.lat, found.lon, "online");
  }

  const offline = await resolveOfflineLocationAsync({
    address: typed || null,
    qthLocation: fromLookup ? lookup.qth : null,
    gridSquare: fromLookup ? lookup.grid : null,
  });
  if (offline?.source === "zip_centroid") {
    return place(offline.lat, offline.lon, "zip", { note: `the centre of ZIP ${offline.sourceText} — approximate` });
  }
  if (offline?.source === "grid_square") {
    return place(offline.lat, offline.lon, "grid", {
      note: `the centre of grid square ${offline.sourceText} — approximate`,
    });
  }

  return {
    ...base,
    grid: fromLookup ? lookup.grid : null,
    lat: null,
    lon: null,
    label: null,
    manual: false,
    placedBy: null,
    approx: false,
    note: typed
      ? online
        ? "not found — pick it on the map"
        : "can't be placed offline — pick it on the map, or it's looked up when you're online"
      : "",
  };
}

/** The roster's Location: the town or QTH, else the address, else the map label. */
export function locationText(c: { qth_location: string; address: string; location_label: string }): string {
  return c.qth_location.trim() || c.address.trim() || c.location_label.trim();
}
