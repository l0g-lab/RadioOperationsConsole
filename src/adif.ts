import type { Activity, Checkin } from "./types";
import { bandOf } from "./bands";
import { gridSquareToLatLon, latLonToGridSquare } from "./grid";
import { isLog } from "./activityTypes";
import { pad2 } from "./utils";

/**
 * ADIF (.adi) export of an activity's check-ins or a station log's contacts,
 * for importing into a logging program (EXPORT-019). Export only: nothing
 * here reads ADIF or talks to LoTW, eQSL or QRZ.
 */

/** A mode as typed (any case) -> ADIF MODE and SUBMODE. Unlisted modes aren't guessed at. */
const ADIF_MODES: Record<string, [string, string?]> = {
  FM: ["FM"],
  SSB: ["SSB"],
  USB: ["SSB", "USB"],
  LSB: ["SSB", "LSB"],
  AM: ["AM"],
  CW: ["CW"],
  DMR: ["DIGITALVOICE", "DMR"],
  "D-STAR": ["DIGITALVOICE", "DSTAR"],
  DSTAR: ["DIGITALVOICE", "DSTAR"],
  C4FM: ["DIGITALVOICE", "C4FM"],
  FUSION: ["DIGITALVOICE", "C4FM"],
  FT8: ["FT8"],
  FT4: ["MFSK", "FT4"],
  JS8: ["MFSK", "JS8"],
  RTTY: ["RTTY"],
  PSK31: ["PSK", "PSK31"],
  PACKET: ["PKT"],
  PKT: ["PKT"],
};

function adifMode(mode: string): [string, string?] | null {
  return ADIF_MODES[mode.trim().toUpperCase()] ?? null;
}

/**
 * The first frequency in typed text that lands in a band, as MHz, read as
 * kHz when that's the only way it does ("7250" -> 7.25). Only a number written
 * like a frequency counts, with a decimal point or four digits or more, so the
 * "4" of a repeater's call sign or "Ch 3" isn't one: null when nothing lands.
 */
export function frequencyMhz(text: string): number | null {
  for (const m of text.matchAll(/\d+\.\d+|\d{4,}/g)) {
    const n = Number(m[0]);
    if (bandOf(n)) return n;
    if (bandOf(n / 1000)) return n / 1000;
  }
  return null;
}

/**
 * The mode a net was most likely on, from its frequency text: a mode written
 * there ("3.975 LSB") if there is one, else FM from 30 MHz up and SSB below.
 * "" when the text has neither (a repeater or channel name).
 */
export function guessMode(frequency: string): string {
  const named = frequency
    .toUpperCase()
    .split(/[^A-Z0-9-]+/)
    .find((w) => w in ADIF_MODES && !/^\d/.test(w));
  if (named) return named === "DSTAR" ? "D-STAR" : named === "FUSION" ? "C4FM" : named;
  const mhz = frequencyMhz(frequency);
  if (mhz == null) return "";
  return mhz >= 30 ? "FM" : "SSB";
}

/** The records that become contacts: everyone but net control's own entry. */
export function adifContacts(checkins: Checkin[], operatorCall: string): Checkin[] {
  const own = operatorCall.trim().toUpperCase();
  return checkins.filter(
    (c) =>
      c.station_kind !== "net_control" &&
      c.call_sign.trim() !== "" &&
      (own === "" || c.call_sign.trim().toUpperCase() !== own)
  );
}

/** Whether any contact has no mode of its own, so the export needs one chosen. */
export function needsMode(contacts: Checkin[]): boolean {
  return contacts.some((c) => !c.mode.trim());
}

/**
 * Plain ASCII on one line, as ADIF's text fields require: accents dropped
 * ("José" -> "Jose"), anything else outside ASCII left out.
 */
function ascii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function field(name: string, value: string): string {
  return value ? `<${name}:${value.length}>${value}` : "";
}

/** "20260921", "230400" (UTC), or null if the text isn't a date. */
function utcDateTime(s: string): [string, string] | null {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return [
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`,
    `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`,
  ];
}

/** A frequency in MHz as ADIF writes it: "146.52", "7.25". */
function mhzText(mhz: number): string {
  return String(Number(mhz.toFixed(6)));
}

/**
 * The contacts as an ADIF file. Each record's own frequency and mode are used
 * where it has them, else the activity's frequency and `defaultMode`. A mode
 * ADIF has no name for is left out of MODE and kept in the comment.
 */
export function checkinsToAdif(
  activity: Activity,
  checkins: Checkin[],
  operatorCall: string,
  defaultMode: string,
  now: Date = new Date()
): string {
  const station = ascii(operatorCall).toUpperCase().replace(/\s+/g, "");
  const myGrid =
    activity.location_lat != null && activity.location_lon != null
      ? latLonToGridSquare(activity.location_lat, activity.location_lon)
      : "";
  const created = utcDateTime(now.toISOString());
  const header =
    `ADIF export from Radio Operations Console: ${ascii(activity.title)}\n` +
    field("ADIF_VER", "3.1.4") +
    " " +
    field("PROGRAMID", "Radio Operations Console") +
    " " +
    field("CREATED_TIMESTAMP", created ? `${created[0]} ${created[1]}` : "") +
    " <EOH>\n";

  const records = adifContacts(checkins, operatorCall).map((c) => {
    const when = utcDateTime(c.checked_in_at);
    const mhz = frequencyMhz(c.frequency) ?? frequencyMhz(activity.frequency);
    const band = bandOf(mhz);
    const typedMode = c.mode.trim() || defaultMode.trim();
    const mode = typedMode ? adifMode(typedMode) : null;
    const power = c.power.match(/\d+(?:\.\d+)?/)?.[0] ?? "";
    const grid = gridSquareToLatLon(c.grid_square) ? c.grid_square.trim() : "";
    const comment = [
      isLog(activity.activity_type) ? "" : activity.title,
      typedMode && !mode ? `Mode: ${typedMode}` : "",
      c.notes,
    ]
      .map(ascii)
      .filter(Boolean)
      .join(" - ");
    return (
      [
        field("CALL", ascii(c.call_sign).toUpperCase().replace(/\s+/g, "")),
        field("QSO_DATE", when?.[0] ?? ""),
        field("TIME_ON", when?.[1] ?? ""),
        field("FREQ", mhz != null ? mhzText(mhz) : ""),
        // CB, MURS and GMRS aren't amateur bands, so ADIF has no name for them.
        field("BAND", band && band.group !== "personal" ? band.label : ""),
        field("MODE", mode?.[0] ?? ""),
        field("SUBMODE", mode?.[1] ?? ""),
        field("RST_SENT", ascii(c.rst_sent)),
        field("RST_RCVD", ascii(c.rst_received)),
        field("TX_PWR", power),
        field("NAME", ascii(c.name)),
        field("QTH", ascii(c.qth_location)),
        field("GRIDSQUARE", grid),
        field("COMMENT", comment),
        field("STATION_CALLSIGN", station),
        field("OPERATOR", station),
        field("MY_GRIDSQUARE", myGrid),
      ]
        .filter(Boolean)
        .join(" ") + " <EOR>\n"
    );
  });
  return header + records.join("");
}
