export interface LatLon {
  lat: number;
  lon: number;
}

const CHAR_A = "A".charCodeAt(0);
const CHAR_0 = "0".charCodeAt(0);

/**
 * Converts a Maidenhead locator (grid square) to its center coordinates,
 * entirely offline (CIMAP-010). Supports 4-, 6-, and 8-character
 * precision; returns null for anything shorter, malformed, or out of
 * range rather than throwing, since this runs on operator-entered text.
 */
export function gridSquareToLatLon(gridRaw: string): LatLon | null {
  const grid = gridRaw.trim().toUpperCase();
  if (grid.length < 4 || grid.length % 2 !== 0) return null;

  const f1 = grid.charCodeAt(0) - CHAR_A;
  const f2 = grid.charCodeAt(1) - CHAR_A;
  if (f1 < 0 || f1 > 17 || f2 < 0 || f2 > 17) return null;

  let lon = f1 * 20 - 180;
  let lat = f2 * 10 - 90;
  let lonSize = 20;
  let latSize = 10;

  const s1 = grid.charCodeAt(2) - CHAR_0;
  const s2 = grid.charCodeAt(3) - CHAR_0;
  if (s1 < 0 || s1 > 9 || s2 < 0 || s2 > 9) return null;
  lon += s1 * 2;
  lat += s2 * 1;
  lonSize = 2;
  latSize = 1;

  if (grid.length >= 6) {
    const sub1 = grid.charCodeAt(4) - CHAR_A;
    const sub2 = grid.charCodeAt(5) - CHAR_A;
    if (sub1 < 0 || sub1 > 23 || sub2 < 0 || sub2 > 23) return null;
    lon += (sub1 * 2) / 24;
    lat += (sub2 * 1) / 24;
    lonSize = 2 / 24;
    latSize = 1 / 24;
  }

  if (grid.length >= 8) {
    const e1 = grid.charCodeAt(6) - CHAR_0;
    const e2 = grid.charCodeAt(7) - CHAR_0;
    if (e1 < 0 || e1 > 9 || e2 < 0 || e2 > 9) return null;
    lon += (e1 * lonSize) / 10;
    lat += (e2 * latSize) / 10;
    lonSize /= 10;
    latSize /= 10;
  }

  return { lat: lat + latSize / 2, lon: lon + lonSize / 2 };
}

/**
 * Converts coordinates to a 6-character Maidenhead locator, entirely
 * offline — the reverse of `gridSquareToLatLon`, used to display the grid
 * square for a location entered as coordinates or a text search rather
 * than typed in directly.
 */
export function latLonToGridSquare(lat: number, lon: number): string {
  const adjLon = lon + 180;
  const adjLat = lat + 90;

  const f1 = Math.floor(adjLon / 20);
  const f2 = Math.floor(adjLat / 10);
  const remLon1 = adjLon - f1 * 20;
  const remLat1 = adjLat - f2 * 10;

  const s1 = Math.floor(remLon1 / 2);
  const s2 = Math.floor(remLat1 / 1);
  const remLon2 = remLon1 - s1 * 2;
  const remLat2 = remLat1 - s2 * 1;

  const sub1 = Math.floor((remLon2 / 2) * 24);
  const sub2 = Math.floor((remLat2 / 1) * 24);

  return (
    String.fromCharCode(CHAR_A + f1) +
    String.fromCharCode(CHAR_A + f2) +
    String.fromCharCode(CHAR_0 + s1) +
    String.fromCharCode(CHAR_0 + s2) +
    String.fromCharCode(CHAR_A + sub1).toLowerCase() +
    String.fromCharCode(CHAR_A + sub2).toLowerCase()
  );
}
