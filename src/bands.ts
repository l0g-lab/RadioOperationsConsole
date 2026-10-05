/**
 * Which band a frequency is in, for a glance at which radio a net needs
 * (NETL-026): amateur bands by name ("2m", "70cm", "20m") and the personal
 * radio services (GMRS, MURS, CB). Colored by group: HF, VHF, UHF, and
 * the personal services.
 */

export type BandGroup = "hf" | "vhf" | "uhf" | "personal";

export interface Band {
  label: string;
  group: BandGroup;
}

/** [low MHz, high MHz, label, group], checked in order. */
const BANDS: [number, number, string, BandGroup][] = [
  [1.8, 2.0, "160m", "hf"],
  [3.5, 4.0, "80m", "hf"],
  [5.33, 5.41, "60m", "hf"],
  [7.0, 7.3, "40m", "hf"],
  [10.1, 10.15, "30m", "hf"],
  [14.0, 14.35, "20m", "hf"],
  [18.068, 18.168, "17m", "hf"],
  [21.0, 21.45, "15m", "hf"],
  [24.89, 24.99, "12m", "hf"],
  [26.965, 27.405, "CB", "personal"],
  [28.0, 29.7, "10m", "hf"],
  [50.0, 54.0, "6m", "vhf"],
  [144.0, 148.0, "2m", "vhf"],
  [151.82, 154.6, "MURS", "personal"],
  [222.0, 225.0, "1.25m", "vhf"],
  [420.0, 450.0, "70cm", "uhf"],
  // GMRS repeater outputs and inputs (the simplex channels fall in these too).
  [462.55, 462.725, "GMRS", "personal"],
  [467.55, 467.725, "GMRS", "personal"],
  [902.0, 928.0, "33cm", "uhf"],
  [1240.0, 1300.0, "23cm", "uhf"],
];

/** The band a frequency in MHz is in, or null outside them. */
export function bandOf(mhz: number | null | undefined): Band | null {
  if (mhz == null || !Number.isFinite(mhz)) return null;
  const hit = BANDS.find(([lo, hi]) => mhz >= lo && mhz <= hi);
  return hit ? { label: hit[2], group: hit[3] } : null;
}

/** The first number in typed frequency text, as MHz: "28.400 USB" -> 28.4. */
export function mhzFromText(text: string): number | null {
  const m = text.match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
