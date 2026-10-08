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
 *  6. the station's exact point from a call-sign lookup (QRZ);
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
  /** Not placed exactly offline: worth looking up online once saved (LOCRES-050). */
  lookUp: boolean;
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
    ...extra,
  });
  const fromFound = (f: FoundPlace, source: PlaceSource, said: string) => {
    const rough = roughness(f.precision);
    return at(f.lat, f.lon, source, rough ? `${said}: ${rough} — approximate` : said, {
      approx: rough != null,
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

  const station = opts.station;
  if (station?.exact) return at(station.exact.lat, station.exact.lon, "qrz", "QRZ's exact point for this station");

  if (typed) {
    const remembered = await api.recallPlace(typed, near).catch(() => null);
    if (remembered) return fromFound(remembered, "remembered", "looked up before");

    if (opts.online === "wait" && canLookUpOnline()) {
      const found = await api.geocodeLocation(typed, near).catch((e) => {
        if (e !== ERR_OFFLINE) throw e;
        return null;
      });
      if (found) return fromFound(found, "online", "found online");
    }
  }

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
    note: !typed
      ? ""
      : later
        ? "looked up online once saved — or pick it on the map"
        : opts.online === "wait" && canLookUpOnline()
          ? "not found — try adding the town, or pick it on the map"
          : "can't be placed offline — pick it on the map",
  };
}
