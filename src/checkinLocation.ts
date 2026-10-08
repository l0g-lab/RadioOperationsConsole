/**
 * A check-in's one Location box (CIMAP-080): whatever was typed — an address,
 * town, ZIP, cross street, mile marker, grid square, saved place, or GPS
 * coordinates — or what a call-sign lookup found, placed by the shared
 * resolver (placeText.ts, LOCRES-060) and sorted into the separate fields a
 * check-in keeps (address, QTH, grid square, map position), so nothing is
 * lost while the form asks for one thing.
 */
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import * as api from "./api";
import { parseCoords } from "./geo";
import { latLonToGridSquare } from "./grid";
import { asGridSquare, canLookUpOnline, placeText, type PlaceSource } from "./placeText";

export { asGridSquare, canLookUpOnline };

/** What a call-sign lookup found, held until saving. */
export interface LookupLocation {
  /** The text it put in the box (its address, else its QTH), to tell whether the box was changed. */
  text: string;
  qth: string | null;
  grid: string | null;
  exact: { lat: number; lon: number } | null;
}

export interface CheckinLocation {
  address: string | null;
  qth: string | null;
  grid: string | null;
  lat: number | null;
  lon: number | null;
  /** What the map point is called. */
  label: string | null;
  /** Placed by hand (pin, coordinates, mile marker, saved place): left alone by later lookups. */
  manual: boolean;
  placedBy: PlaceSource | null;
  /** Only roughly placed (a centre, or somewhere along a street). */
  approx: boolean;
  /** Where it lands, in words, e.g. "the centre of ZIP 32817". */
  note: string;
  /**
   * The typed text should be looked up online once saved (LOCRES-050): nothing
   * placed it exactly here. `placeCheckinLater` does it when connected.
   */
  lookUp: boolean;
  /** The grid square came from the call-sign lookup, so a lookup leaves it. */
  keepGrid: boolean;
}

/**
 * Sorts the Location box into a check-in's fields, placed by the shared
 * resolver (`placeText`, in its order) without waiting on the internet:
 * what isn't placed exactly is marked `lookUp`, to be looked up online after
 * saving. The call-sign lookup counts only while the box still holds what it
 * found. A grid square is worked out from the position when there isn't one.
 */
export async function resolveCheckinLocation(
  text: string,
  {
    lookup = null,
    pin = null,
    near = null,
  }: {
    lookup?: LookupLocation | null;
    pin?: { lat: number; lon: number; label: string } | null;
    /** Where the net is: remembered places are recalled for it (LOCRES-053). */
    near?: { lat: number; lon: number } | null;
  } = {}
): Promise<CheckinLocation> {
  const typed = text.trim();
  const fromLookup = lookup != null && typed === lookup.text.trim();
  const station = fromLookup ? { qth: lookup.qth, grid: lookup.grid, exact: lookup.exact } : null;
  const p = await placeText(typed, { pin, station, near, online: "later" });
  const typedGrid = p.source === "grid" ? asGridSquare(typed) : null;
  return {
    address: typed && !asGridSquare(typed) && !parseCoords(typed) ? typed : null,
    qth: station?.qth ?? null,
    grid:
      (fromLookup && lookup.grid) || typedGrid || (p.lat != null && p.lon != null ? latLonToGridSquare(p.lat, p.lon) : null),
    lat: p.lat,
    lon: p.lon,
    label: p.label,
    manual: p.manual,
    placedBy: p.source,
    approx: p.approx,
    note: p.note,
    lookUp: p.lookUp,
    keepGrid: fromLookup && !!lookup.grid,
  };
}

/**
 * After saving: looks a check-in's typed location up online in the
 * background, near the net (LOCRES-050). The roster updates when it lands
 * (`useLocationPlaced`). Nothing to do when it was placed exactly, or offline.
 */
export function placeCheckinLater(
  checkinId: string,
  text: string,
  loc: Pick<CheckinLocation, "lookUp" | "keepGrid">,
  near: { lat: number; lon: number } | null
) {
  if (!loc.lookUp || !canLookUpOnline()) return;
  api.placeCheckinLater(checkinId, text.trim(), near, !loc.keepGrid).catch(() => {});
}

/** The same for a spotter report's Location box. */
export function placeReportLater(
  reportId: string,
  text: string,
  loc: Pick<CheckinLocation, "lookUp">,
  near: { lat: number; lon: number } | null
) {
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
