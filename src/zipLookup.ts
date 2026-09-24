export interface LatLon {
  lat: number;
  lon: number;
}

// Matches the "City, ST 12345" (or ZIP+4) tail that QRZ-style US addresses
// end with, so a house number earlier in the string is never mistaken for a
// ZIP code.
const ZIP_AFTER_STATE_RE = /\b[A-Z]{2}\s+(\d{5})(?:-\d{4})?\b/;
// Fallback for addresses that don't follow that shape but still contain a
// bare 5-digit ZIP somewhere.
const ZIP_ANYWHERE_RE = /\b(\d{5})(?:-\d{4})?\b/;

/** Pulls a 5-digit ZIP out of a free-text US address string, if present. */
export function extractZip(address: string): string | null {
  const afterState = address.match(ZIP_AFTER_STATE_RE);
  if (afterState) return afterState[1];
  const anywhere = address.match(ZIP_ANYWHERE_RE);
  return anywhere ? anywhere[1] : null;
}

export type ZipCentroidTable = Record<string, number[]>;

let tablePromise: Promise<ZipCentroidTable> | null = null;

/**
 * Loads the bundled offline ZIP-code centroid table as its own lazy chunk
 * (~340KB gzipped for all ~41k US ZIPs) instead of inlining it into the main
 * app bundle, since only offline location resolution
 * (`locationResolution.ts`) needs it. Data: GeoNames postal code export
 * (CC BY 4.0, https://www.geonames.org).
 */
export function loadZipCentroids(): Promise<ZipCentroidTable> {
  if (!tablePromise) {
    tablePromise = import("./data/zipCentroids.json").then(
      (mod) => mod.default as ZipCentroidTable
    );
  }
  return tablePromise;
}

/** Looks up a US ZIP code's centroid in an already-loaded table. */
export function zipCentroidLookup(table: ZipCentroidTable, zip: string): LatLon | null {
  const entry = table[zip];
  return entry ? { lat: entry[0], lon: entry[1] } : null;
}
