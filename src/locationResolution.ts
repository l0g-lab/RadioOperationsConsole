import { gridSquareToLatLon } from "./grid";
import { extractZip, loadZipCentroids, zipCentroidLookup, type ZipCentroidTable } from "./zipLookup";

export type LocationSource = "typed_coords" | "qrz_exact" | "zip_centroid" | "grid_square";

export interface ResolvedLocation {
  lat: number;
  lon: number;
  source: LocationSource;
  /** Whatever produced this — the ZIP, the grid square, or "lat, lon". */
  sourceText: string;
}

export interface LocationInputs {
  /** Already-known exact coordinates (e.g. a manually dropped pin) — wins outright over anything derived. */
  lat?: number | null;
  lon?: number | null;
  /** QRZ's exact point for the station (geocoded/user-supplied on QRZ's side) — beats anything this app would round off itself. */
  qrzLat?: number | null;
  qrzLon?: number | null;
  gridSquare?: string | null;
  address?: string | null;
  qthLocation?: string | null;
}

/**
 * The approximate end of the shared place resolver (placeText.ts, LOCRES-060):
 * a ZIP code's centre, else a grid square's. Only placeText calls it; every
 * location box goes through placeText, not here.
 *
 * Originally the one offline-first location resolution order used everywhere in this
 * app, so every feature that needs "text -> coordinates" agrees on the same
 * answer instead of each reimplementing its own priority (this used to be
 * ZIP-then-grid in the check-in map but grid-then-nothing in QRZ operator
 * seeding — an accident of separate implementations, not a real reason
 * for the two to differ):
 *
 *  1. Already-known exact coordinates (typed/dropped pin) — authoritative.
 *  2. QRZ's own exact coordinates for the station, when QRZ has a real
 *     point (not just its own rounding to a grid/ZIP) — already fetched
 *     with the callbook lookup, so no extra network call.
 *  3. A ZIP code pulled from address/QTH text, resolved via the bundled
 *     offline centroid table — usually tighter than a grid square in
 *     populated areas.
 *  4. A grid square, via offline Maidenhead math.
 *
 * Online geocoding is deliberately NOT part of this function — per this
 * app's "offline first, online as an add-on" approach, callers that want
 * to fall back further should treat a `null` result here as the signal to
 * attempt `api.geocodeLocation` themselves, explicitly, rather than this
 * shared function reaching for the network on their behalf.
 */
export function resolveOfflineLocation(
  inputs: LocationInputs,
  zipTable: ZipCentroidTable | null
): ResolvedLocation | null {
  if (inputs.lat != null && inputs.lon != null) {
    return {
      lat: inputs.lat,
      lon: inputs.lon,
      source: "typed_coords",
      sourceText: `${inputs.lat}, ${inputs.lon}`,
    };
  }

  if (inputs.qrzLat != null && inputs.qrzLon != null) {
    return {
      lat: inputs.qrzLat,
      lon: inputs.qrzLon,
      source: "qrz_exact",
      sourceText: `${inputs.qrzLat}, ${inputs.qrzLon}`,
    };
  }

  if (zipTable) {
    const zip =
      (inputs.address ? extractZip(inputs.address) : null) ??
      (inputs.qthLocation ? extractZip(inputs.qthLocation) : null);
    if (zip) {
      const coords = zipCentroidLookup(zipTable, zip);
      if (coords) {
        return { lat: coords.lat, lon: coords.lon, source: "zip_centroid", sourceText: zip };
      }
    }
  }

  const grid = inputs.gridSquare?.trim();
  if (grid) {
    const coords = gridSquareToLatLon(grid);
    if (coords) {
      return { lat: coords.lat, lon: coords.lon, source: "grid_square", sourceText: grid };
    }
  }

  return null;
}

/** Convenience wrapper that loads the ZIP table (cached after first call) then resolves. */
export async function resolveOfflineLocationAsync(
  inputs: LocationInputs
): Promise<ResolvedLocation | null> {
  const zipTable = await loadZipCentroids();
  return resolveOfflineLocation(inputs, zipTable);
}
