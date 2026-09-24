import { latLonToGridSquare } from "./grid";

/** Great-circle distance between two coordinates, in kilometers. Pure offline math (CIMAP-064). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function kmToMiles(km: number): number {
  return km * 0.621371;
}

/** e.g. "42.3 km (26.3 mi)" */
export function formatDistance(km: number): string {
  return `${km.toFixed(1)} km (${kmToMiles(km).toFixed(1)} mi)`;
}

export type CoordFormat = "dd" | "ddm" | "dms";

export const COORD_FORMAT_LABELS: Record<CoordFormat, string> = {
  dd: "Decimal degrees (39.73915, -104.99030)",
  ddm: "Degrees & decimal minutes (39°44.349′N, 104°59.418′W)",
  dms: "Degrees, minutes, seconds (39°44′20.9″N, 104°59′25.1″W)",
};

const FORMAT_KEY = "roc-coord-format";

export function getCoordFormat(): CoordFormat {
  try {
    const v = localStorage.getItem(FORMAT_KEY);
    if (v === "ddm" || v === "dms") return v;
  } catch {
    // Storage unavailable: use the default.
  }
  return "dd";
}

export function setCoordFormat(fmt: CoordFormat) {
  try {
    if (fmt === "dd") localStorage.removeItem(FORMAT_KEY);
    else localStorage.setItem(FORMAT_KEY, fmt);
  } catch {
    // Not remembered, but nothing else depends on it.
  }
}

/** One latitude or longitude in the given format, e.g. "104°59′25.1″W". */
export function formatAxis(
  value: number,
  axis: "lat" | "lon",
  fmt: CoordFormat = getCoordFormat()
): string {
  if (fmt === "dd") return value.toFixed(5);
  const hem = axis === "lat" ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";
  const abs = Math.abs(value);
  if (fmt === "ddm") {
    // Round in whole thousandths of a minute so 59.9996′ carries into the degree.
    const total = Math.round(abs * 60 * 1000);
    const deg = Math.floor(total / 60000);
    const min = (total % 60000) / 1000;
    return `${deg}°${min.toFixed(3)}′${hem}`;
  }
  const total = Math.round(abs * 3600 * 10);
  const deg = Math.floor(total / 36000);
  const min = Math.floor((total % 36000) / 600);
  const sec = (total % 600) / 10;
  return `${deg}°${min}′${sec.toFixed(1)}″${hem}`;
}

/** e.g. "39.73915, -104.99030", or in the chosen format for degrees/minutes. */
export function formatCoords(lat: number, lon: number, fmt: CoordFormat = getCoordFormat()): string {
  return `${formatAxis(lat, "lat", fmt)}, ${formatAxis(lon, "lon", fmt)}`;
}

/** e.g. "39.73915, -104.99030 (DM79mr)" — coordinates in the chosen format plus the Maidenhead grid square. */
export function formatCoordsWithGrid(lat: number, lon: number): string {
  return `${formatCoords(lat, lon)} (${latLonToGridSquare(lat, lon)})`;
}

interface Component {
  nums: number[];
  /** Whether each number was written with a leading minus. */
  negs: boolean[];
  hem: string | null;
}

/**
 * Splits text such as `N 39 44 21.5, W 104 59 25` or `39°44.35′N 104°59.42′W`
 * into latitude/longitude pieces. Symbols (° ′ ″) are optional; hemisphere
 * letters may lead or trail. Returns null for anything else.
 */
function collect(text: string): { comps: Component[]; sawComma: boolean } | null {
  const norm = text.toUpperCase().replace(/[°º˚′’'″”"]/g, " ");
  const tokens = norm.match(/[NSEW]|,|-?\d+(?:\.\d+)?/g);
  if (!tokens) return null;
  if (norm.replace(/[NSEW]|,|-?\d+(?:\.\d+)?/g, "").trim() !== "") return null;

  const comps: Component[] = [];
  let cur: Component = { nums: [], negs: [], hem: null };
  let sawComma = false;
  const finish = () => {
    if (cur.nums.length > 0) comps.push(cur);
    cur = { nums: [], negs: [], hem: null };
  };
  for (const t of tokens) {
    if (t === ",") {
      sawComma = true;
      finish();
    } else if (/^[NSEW]$/.test(t)) {
      if (cur.nums.length === 0) {
        if (cur.hem) return null;
        cur.hem = t;
      } else if (cur.hem === null) {
        cur.hem = t;
        finish();
      } else {
        finish();
        cur.hem = t;
      }
    } else {
      cur.negs.push(t.startsWith("-"));
      cur.nums.push(Math.abs(parseFloat(t)));
    }
  }
  if (cur.hem && cur.nums.length === 0) return null;
  finish();
  return { comps, sawComma };
}

function componentValue(c: Component): number | null {
  const [d, m, sec] = c.nums;
  if (c.nums.length > 3) return null;
  if (c.nums.length > 1 && !Number.isInteger(d)) return null;
  if (c.nums.length > 2 && !Number.isInteger(m)) return null;
  if ((m ?? 0) >= 60 || (sec ?? 0) >= 60) return null;
  let v = d + (m ?? 0) / 60 + (sec ?? 0) / 3600;
  const southWest = c.hem === "S" || c.hem === "W";
  if (c.negs.slice(1).some(Boolean)) return null;
  if (c.negs[0] && c.hem) return null;
  if (c.negs[0] || southWest) v = -v;
  return v;
}

/** Parses one latitude or longitude in any supported format; null if malformed or out of range. */
export function parseAxis(text: string, axis: "lat" | "lon"): number | null {
  const got = collect(text);
  if (!got || got.comps.length !== 1) return null;
  const c = got.comps[0];
  if (c.hem && !(axis === "lat" ? "NS" : "EW").includes(c.hem)) return null;
  const v = componentValue(c);
  if (v == null) return null;
  return Math.abs(v) <= (axis === "lat" ? 90 : 180) ? v : null;
}

/**
 * Parses "lat, lon" in decimal degrees, degrees & decimal minutes, or degrees/minutes/seconds
 * (comma or space separated); null if malformed or out of range.
 */
export function parseCoords(text: string): { lat: number; lon: number } | null {
  const got = collect(text);
  if (!got) return null;
  let comps = got.comps;
  if (comps.length === 1 && !comps[0].hem && !got.sawComma) {
    // No hemisphere letters or comma: split the numbers evenly (2, 4 or 6 of them).
    const c = comps[0];
    const n = c.nums.length;
    if (n !== 2 && n !== 4 && n !== 6) return null;
    const half = n / 2;
    comps = [
      { nums: c.nums.slice(0, half), negs: c.negs.slice(0, half), hem: null },
      { nums: c.nums.slice(half), negs: c.negs.slice(half), hem: null },
    ];
  }
  if (comps.length !== 2) return null;
  let [a, b] = comps;
  if ((a.hem === "E" || a.hem === "W") && (b.hem === "N" || b.hem === "S")) [a, b] = [b, a];
  if (a.hem && !"NS".includes(a.hem)) return null;
  if (b.hem && !"EW".includes(b.hem)) return null;
  const lat = componentValue(a);
  const lon = componentValue(b);
  if (lat == null || lon == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
