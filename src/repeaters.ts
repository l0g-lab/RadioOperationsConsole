import type { Repeater, RepeaterDetails, ToneKind } from "./types";

/**
 * The repeater directory (docs/features/repeater-directory.md). The backend
 * checks the same tone lists (src-tauri/src/repeaters.rs); keep them in step.
 */

/** The standard CTCSS (PL) tones in Hz, as CHIRP lists them (RPT-003). */
export const CTCSS_TONES = [
  "67.0", "69.3", "71.9", "74.4", "77.0", "79.7", "82.5", "85.4", "88.5", "91.5", "94.8", "97.4",
  "100.0", "103.5", "107.2", "110.9", "114.8", "118.8", "123.0", "127.3", "131.8", "136.5",
  "141.3", "146.2", "151.4", "156.7", "159.8", "162.2", "165.5", "167.9", "171.3", "173.8",
  "177.3", "179.9", "183.5", "186.2", "189.9", "192.8", "196.6", "199.5", "203.5", "206.5",
  "210.7", "218.1", "225.7", "229.1", "233.6", "241.8", "250.3", "254.1",
];

/** The standard DCS codes, as CHIRP lists them (RPT-003). */
export const DCS_CODES = [
  "023", "025", "026", "031", "032", "036", "043", "047", "051", "053", "054", "065", "071",
  "072", "073", "074", "114", "115", "116", "122", "125", "131", "132", "134", "143", "145",
  "152", "155", "156", "162", "165", "172", "174", "205", "212", "223", "225", "226", "243",
  "244", "245", "246", "251", "252", "255", "261", "263", "265", "266", "271", "274", "306",
  "311", "315", "325", "331", "332", "343", "346", "351", "356", "364", "365", "371", "411",
  "412", "413", "423", "431", "432", "445", "446", "452", "454", "455", "462", "464", "465",
  "466", "503", "506", "516", "523", "526", "532", "546", "565", "606", "612", "624", "627",
  "631", "632", "654", "662", "664", "703", "712", "723", "731", "732", "734", "743", "754",
];

/** "146.940", or "145.2725" when a fourth decimal matters. */
export function formatMhz(mhz: number): string {
  const four = mhz.toFixed(4);
  return four.endsWith("0") ? four.slice(0, -1) : four;
}

/** "PL 100.0", "DCS 023N", or "" for no tone. */
export function toneText(kind: ToneKind, value: string): string {
  if (kind === "pl") return `PL ${value}`;
  if (kind === "dcs") return `DCS ${value}`;
  return "";
}

/**
 * The repeater on one line, as shown everywhere and copied onto activities
 * (RPT-005): "146.940 -0.600 PL 100.0", "146.520 simplex",
 * "147.000 +0.600 PL 100.0 / out PL 123.0". A mode other than FM is added.
 */
export function formatRepeater(r: RepeaterDetails): string {
  const parts = [formatMhz(r.output_mhz)];
  if (r.offset_mhz === 0) parts.push("simplex");
  else parts.push(`${r.offset_mhz > 0 ? "+" : "-"}${Math.abs(r.offset_mhz).toFixed(3)}`);
  const input = toneText(r.tone_in_kind, r.tone_in);
  const output = toneText(r.tone_out_kind, r.tone_out);
  if (input) parts.push(input);
  if (output && output !== input) parts.push(`${input ? "/ " : ""}out ${output}`);
  if (r.mode && r.mode.toUpperCase() !== "FM") parts.push(r.mode);
  return parts.join(" ");
}

/** Where a station transmits: output plus offset. */
export function inputMhz(r: Pick<RepeaterDetails, "output_mhz" | "offset_mhz">): number {
  return Math.round((r.output_mhz + r.offset_mhz) * 10000) / 10000;
}

/** The usual offset amount for the band, never its direction (RPT-002). */
export function suggestedOffset(outputMhz: number): number | null {
  if (outputMhz >= 50 && outputMhz <= 54) return 0.5;
  if (outputMhz >= 144 && outputMhz <= 148) return 0.6;
  if (outputMhz >= 222 && outputMhz <= 225) return 1.6;
  if (outputMhz >= 420 && outputMhz <= 450) return 5.0;
  return null;
}

/** Matches the search box against name, frequency, and notes (RPT-011). */
export function repeaterMatches(r: Repeater, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [r.name, formatRepeater(r), r.notes, r.location_label].some((v) =>
    v.toLowerCase().includes(q)
  );
}
