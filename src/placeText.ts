/**
 * The one place resolver (LOCRES-060): whatever is typed into any location
 * box in the app, or found by a call-sign lookup, put on the map the same
 * way. Check-ins, spotter reports, net control, operators, repeaters, saved
 * places, the weather and APRS areas, and the map picker's search all use it.
 *
 * Best first, offline before online:
 *  1. a spot picked on the map;
 *  2. typed coordinates, in any format (geo.ts);
 *  3. a grid square typed on its own (its centre, approximate);
 *  4. a mile marker (offline road data);
 *  5. a saved place, typed by name ("EOC");
 *  6. the station's exact point from a call-sign lookup (QRZ) — unless its
 *     street address matches a house, which wins: QRZ's point can be an old
 *     or rough one (LOCRES-062);
 *  7. a place already looked up, remembered (works offline);
 *  8. when waiting for it, the online lookup (geocode.rs);
 *  9. a ZIP code's centre, else the station's grid square (approximate).
 *
 * Where nobody waits (a check-in or report being saved), what isn't placed
 * exactly is marked `lookUp`, and looked up online after saving
 * (LOCRES-050). A typed grid square, mile marker, saved place or remembered
 * place already says what it can, so isn't looked up again.
 */
import * as api from "./api";
import { parseCoords } from "./geo";
import { gridSquareToLatLon } from "./grid";
import { resolveOfflineLocationAsync } from "./locationResolution";
import { isWorkingOffline } from "./workOffline";
import { ERR_OFFLINE, type FoundPlace, type FoundPrecision, type Place } from "./types";

/** How a point was arrived at. */
export type PlaceSource =
  | "pin" // picked on the map
  | "coords" // typed coordinates
  | "grid" // a typed grid square's centre
  | "mile_marker"
  | "saved_place"
  | "qrz" // the call-sign lookup's exact point
  | "remembered" // looked up before
  | "online"
  | "zip" // a ZIP code's centre
  | "station_grid"; // the call-sign lookup's grid square's centre

export interface Placement {
  lat: number | null;
  lon: number | null;
  /** What the point is called on the map. */
  label: string | null;
  source: PlaceSource | null;
  /** Placed by hand (a pin, coordinates, a mile marker, a saved place): later lookups leave it alone (CIMAP-003). */
  manual: boolean;
  /** Only roughly placed: a centre, or somewhere along a street. */
  approx: boolean;
  /** Where it lands, in words. */
  note: string;
  /** What a place found online or remembered was matched as (an address, a crossing, a town…). */
  precision?: FoundPrecision;
  /** Not placed exactly offline: worth looking up online once saved (LOCRES-050). */
  lookUp: boolean;
  /**
   * Already placed (QRZ's point): the lookup after saving should move it only
   * to a matched house or corner, never to a vaguer street or town.
   */
  lookUpExactOnly: boolean;
}

/** What a call-sign lookup knows about where a station is. */
export interface StationPlace {
  qth: string | null;
  grid: string | null;
  /** QRZ's exact point, when it has one (not a rounded grid or ZIP). */
  exact: { lat: number; lon: number } | null;
}

export interface PlaceOptions {
  pin?: { lat: number; lon: number; label: string } | null;
  station?: StationPlace | null;
  /** Where the net is: places are looked for near it first (LOCRES-053). */
  near?: { lat: number; lon: number } | null;
  /**
   * "wait": someone is waiting for the answer (a search box), so the online
   * lookup runs now. "later": being saved, so it's looked up afterwards.
   */
  online: "wait" | "later";
}

/** Connected, and not working offline: online lookups can run. */
export const canLookUpOnline = () => navigator.onLine && !isWorkingOffline();

/** A Maidenhead grid square typed on its own, e.g. "EL98" or "el98hm". */
export function asGridSquare(text: string): string | null {
  const t = text.trim();
  return /^[A-Ra-r]{2}\d{2}([A-Xa-x]{2})?$/.test(t)
    ? t.slice(0, 2).toUpperCase() + t.slice(2, 4) + t.slice(4).toLowerCase()
    : null;
}

/** How rough a found place is, in words; null when it's exact. */
export function roughness(p: FoundPrecision): string | null {
  switch (p) {
    case "street":
      return "somewhere along the street";
    case "town":
      return "the town's centre";
    case "region":
      return "the area's centre";
    default:
      return null;
  }
}

/**
 * How a record's map point was arrived at, as it's kept (LOCRES-064): what
 * placed it, or for a place found online or remembered, what it matched.
 */
export function howPlaced(p: Pick<Placement, "source" | "precision" | "lat">): string | null {
  if (p.lat == null || !p.source) return null;
  return p.source === "online" || p.source === "remembered" ? (p.precision ?? null) : p.source;
}

/** Each "how placed" in words, and whether it's only approximate. */
export const HOW: Record<string, { words: string; approx: boolean }> = {
  pin: { words: "picked on the map", approx: false },
  coords: { words: "typed coordinates", approx: false },
  mile_marker: { words: "a mile marker", approx: false },
  saved_place: { words: "a saved place", approx: false },
  qrz: { words: "QRZ's point for the station", approx: false },
  address: { words: "the street address", approx: false },
  crossing: { words: "where the streets cross", approx: false },
  grid: { words: "the centre of the grid square typed", approx: true },
  station_grid: { words: "the centre of the station's grid square", approx: true },
  zip: { words: "the centre of the ZIP code", approx: true },
  street: { words: "somewhere along the street", approx: true },
  town: { words: "the town's centre", approx: true },
  region: { words: "the area's centre", approx: true },
};

/** Whether a record's point is only approximate. */
export const isApproximate = (how: string) => HOW[how]?.approx ?? false;

/** "Placed by: the centre of the ZIP code — approximate", or "" when not known. */
export function howText(how: string): string {
  const h = HOW[how];
  return h ? `Placed by: ${h.words}${h.approx ? " — approximate" : ""}` : "";
}

/** A saved place whose name is what's typed, ignoring case. */
export function savedPlaceNamed(places: Place[], text: string): Place | null {
  const t = text.trim().toLowerCase();
  return (t && places.find((p) => p.name.trim().toLowerCase() === t)) || null;
}

export async function placeText(text: string, opts: PlaceOptions): Promise<Placement> {
  const typed = text.trim();
  const near = opts.near ? { lat: opts.near.lat, lon: opts.near.lon } : null;
  const at = (
    lat: number,
    lon: number,
    source: PlaceSource,
    note: string,
    extra: Partial<Placement> = {}
  ): Placement => ({
    lat,
    lon,
    label: typed || null,
    source,
    manual: false,
    approx: false,
    note,
    lookUp: false,
    lookUpExactOnly: false,
    ...extra,
  });
  const fromFound = (f: FoundPlace, source: PlaceSource, said: string) => {
    const rough = roughness(f.precision);
    return at(f.lat, f.lon, source, rough ? `${said}: ${rough} — approximate` : said, {
      approx: rough != null,
      precision: f.precision,
      label: rough ? `${typed} (${rough} — approximate)` : typed || f.label,
    });
  };

  const pin = opts.pin;
  if (pin) return at(pin.lat, pin.lon, "pin", "the spot picked on the map", { manual: true, label: pin.label || typed || null });

  const coords = parseCoords(typed);
  if (coords) return at(coords.lat, coords.lon, "coords", "the coordinates typed", { manual: true });

  const grid = asGridSquare(typed);
  if (grid) {
    const c = gridSquareToLatLon(grid);
    if (c) return at(c.lat, c.lon, "grid", `the centre of grid square ${grid} — approximate`, { approx: true });
  }

  if (typed) {
    const mile = await api.resolveMileMarker(typed).catch(() => null);
    if (mile) return at(mile.lat, mile.lon, "mile_marker", mile.label, { manual: true, label: mile.label });

    const saved = savedPlaceNamed(await api.listPlaces().catch(() => []), typed);
    if (saved) {
      return at(saved.lat, saved.lon, "saved_place", `your saved place “${saved.name}”`, { manual: true, label: saved.name });
    }
  }

  // The online search, when someone is waiting for it. A failure isn't the
  // end: what can be placed offline still is.
  let searchFailed: string | null = null;
  const search = async () => {
    if (!typed || opts.online !== "wait" || !canLookUpOnline()) return null;
    try {
      return await api.geocodeLocation(typed, near);
    } catch (e) {
      if (e !== ERR_OFFLINE) searchFailed = String(e);
      return null;
    }
  };
  const remembered = typed ? await api.recallPlace(typed, near).catch(() => null) : null;

  const station = opts.station;
  if (station?.exact) {
    // A street address that matches a house beats QRZ's point (LOCRES-062).
    const house = hasHouseNumber(typed);
    if (house) {
      if (remembered?.precision === "address") return fromFound(remembered, "remembered", rememberedSaid(remembered));
      const found = await search();
      if (found?.precision === "address") return fromFound(found, "online", "found online");
    }
    return at(station.exact.lat, station.exact.lon, "qrz", "QRZ's point for this station", {
      lookUp: house && opts.online === "later",
      lookUpExactOnly: true,
    });
  }

  if (remembered) return fromFound(remembered, "remembered", rememberedSaid(remembered));
  const found = await search();
  if (found) return fromFound(found, "online", "found online");

  // Nothing exact offline: worth an online lookup once saved.
  const lookUp = opts.online === "later" && !!typed;
  const later = lookUp && canLookUpOnline() ? " — looked up exactly online once saved" : "";
  const offline = await resolveOfflineLocationAsync({
    address: typed || null,
    qthLocation: station?.qth ?? null,
    gridSquare: station?.grid ?? null,
  });
  if (offline?.source === "zip_centroid") {
    return at(offline.lat, offline.lon, "zip", `the centre of ZIP ${offline.sourceText} — approximate${later}`, {
      approx: true,
      lookUp,
    });
  }
  if (offline?.source === "grid_square") {
    return at(offline.lat, offline.lon, "station_grid", `the centre of grid square ${offline.sourceText} — approximate${later}`, {
      approx: true,
      lookUp,
    });
  }

  return {
    lat: null,
    lon: null,
    label: null,
    source: null,
    manual: false,
    approx: false,
    lookUp,
    lookUpExactOnly: false,
    note: !typed
      ? ""
      : later
        ? "looked up online once saved — or pick it on the map"
        : searchFailed
          ? `the online search failed (${searchFailed}) — try again, or pick it on the map`
          : opts.online === "wait" && canLookUpOnline()
            ? "not found — try adding the town, or pick it on the map"
            : "can't be placed offline — pick it on the map",
  };
}

/** How a remembered place was found, in words. */
function rememberedSaid(f: FoundPlace): string {
  return f.source === "known streets" ? "worked out from streets looked up before" : "looked up before";
}

/** A street address starting with a house number ("9296 SW 183rd Ter, …"). */
export function hasHouseNumber(text: string): boolean {
  return /^\d+[A-Za-z]?\s+[A-Za-z]/.test(text.trim());
}
