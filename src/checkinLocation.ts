/**
 * A check-in's one Location box (CIMAP-080): whatever was typed — an address,
 * town, ZIP, cross street, mile marker, grid square, or GPS coordinates — or
 * what a call-sign lookup found, sorted into the separate fields a check-in
 * keeps (address, QTH, grid square, map position), so nothing is lost while
 * the form asks for one thing.
 */
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import * as api from "./api";
import { parseCoords } from "./geo";
import type { MapPoint } from "./mapPoints";
import { isWorkingOffline } from "./workOffline";
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
  /**
   * The typed text should be looked up online once saved (LOCRES-050): nothing
   * placed it exactly here. `placeLater` does it when connected.
   */
  lookUp: boolean;
  /** The grid square came from the call-sign lookup, so a lookup leaves it. */
  keepGrid: boolean;
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
  zip: "the centre of the ZIP code — approximate",
  grid: "the centre of the grid square — approximate",
};

/** Connected, and not working offline: online lookups can run. */
export const canLookUpOnline = () => navigator.onLine && !isWorkingOffline();

/**
 * Sorts the Location box into a check-in's fields. Best first: a pin dropped
 * on the map; typed coordinates; a mile marker; a grid square typed on its own;
 * the lookup's exact point (if the box still holds what it found); a ZIP
 * code's centre; the lookup's grid square. A grid square is worked out from
 * the position when there isn't one. All offline: anything not placed
 * exactly is marked `lookUp`, to be looked up online after saving
 * (`placeLater`), so saving never waits on the internet. `online` only
 * changes what the note says.
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
    lookUp: false,
    keepGrid: fromLookup && !!lookup.grid,
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

  // From here on it's looked up online after saving, when connected.
  base.lookUp = !!typed;
  const later = online ? " — looked up exactly online once saved" : "";

  const offline = await resolveOfflineLocationAsync({
    address: typed || null,
    qthLocation: fromLookup ? lookup.qth : null,
    gridSquare: fromLookup ? lookup.grid : null,
  });
  if (offline?.source === "zip_centroid") {
    return place(offline.lat, offline.lon, "zip", {
      note: `the centre of ZIP ${offline.sourceText} — approximate${later}`,
    });
  }
  if (offline?.source === "grid_square") {
    return place(offline.lat, offline.lon, "grid", {
      note: `the centre of grid square ${offline.sourceText} — approximate${later}`,
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
        ? "looked up online once saved — or pick it on the map"
        : "can't be placed offline — pick it on the map"
      : "",
  };
}

/**
 * After saving: looks a check-in's typed location up online in the
 * background, near the net (LOCRES-050). The roster updates when it lands
 * (`useLocationPlaced`). Nothing to do when it was placed exactly, or offline.
 */
export function placeCheckinLater(checkinId: string, text: string, loc: CheckinLocation, near: MapPoint | null) {
  if (!loc.lookUp || !canLookUpOnline()) return;
  api.placeCheckinLater(checkinId, text.trim(), near, !loc.keepGrid).catch(() => {});
}

/** The same for a spotter report's Location box. */
export function placeReportLater(reportId: string, text: string, loc: CheckinLocation, near: MapPoint | null) {
  if (!loc.lookUp || !canLookUpOnline()) return;
  api.placeReportLater(reportId, text.trim(), near).catch(() => {});
}

/** Calls `onPlaced` when a background lookup puts one of this activity's entries on the map. */
export function useLocationPlaced(activityId: string | null, onPlaced: () => void) {
  useEffect(() => {
    if (!activityId) return;
    let unlisten: (() => void) | null = null;
    let gone = false;
    listen<string>("location-placed", (e) => {
      if (e.payload === activityId) onPlaced();
    })
      .then((u) => (gone ? u() : (unlisten = u)))
      .catch(() => {});
    return () => {
      gone = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);
}

/** The roster's Location: the town or QTH, else the address, else the map label. */
export function locationText(c: { qth_location: string; address: string; location_label: string }): string {
  return c.qth_location.trim() || c.address.trim() || c.location_label.trim();
}
