import * as api from "./api";
import type { LicenseService, OfflineCallRecord, QrzLookupResponse } from "./types";
import { QRZ_ERR_NOT_CONFIGURED } from "./types";

/** Where a result came from: QRZ, the FCC amateur file, or the FCC GMRS file. */
export type CallsignSource = "qrz" | "fcc" | "gmrs";

const GMRS_RE = /^[A-Z]{3,4}[0-9]{3,4}$/;
const AMATEUR_RE = /^[A-Z]{1,2}[0-9][A-Z]{1,3}$/;

/**
 * Which kind of U.S. license a call sign belongs to, from its shape alone:
 * GMRS calls end in digits (WRAB123, KAE1234), amateur calls end in a letter
 * (W1AW, KD8XYZ). Portable, mobile and unit suffixes ("/P", "/2") and
 * prefixes ("VE3/") are ignored.
 */
export function callSignService(call: string): LicenseService | "unknown" {
  const parts = call.replace(/\s+/g, "").toUpperCase().split("/");
  if (parts.some((p) => GMRS_RE.test(p))) return "gmrs";
  if (parts.some((p) => AMATEUR_RE.test(p))) return "amateur";
  return "unknown";
}

export type CallsignLookup =
  | {
      kind: "found";
      source: CallsignSource;
      data: QrzLookupResponse;
      /** FCC file predates street addresses, so the address is only city/state/ZIP. */
      fileLacksStreet?: boolean;
    }
  | { kind: "not_found"; source: CallsignSource }
  /** The call sign needs an offline file that isn't downloaded (GMRS has no other source). */
  | { kind: "missing_file"; service: LicenseService }
  /** Neither QRZ nor the offline directory could answer. `error` is QRZ's. */
  | { kind: "unavailable"; error: unknown };

/** How the check-in screens describe a lookup's source (CALLDIR-022, CALLDIR-045). */
export function sourceLabels(source: CallsignSource): {
  found: string;
  notFound: string;
  updated: string;
  button: string;
} {
  switch (source) {
    case "qrz":
      return { found: "QRZ match", notFound: "no QRZ match", updated: "Updated from QRZ", button: "Lookup QRZ" };
    case "fcc":
      return {
        found: "FCC amateur record (offline)",
        notFound: "not in FCC amateur file",
        updated: "Updated from FCC amateur file",
        button: "Lookup (FCC file)",
      };
    case "gmrs":
      // One GMRS license covers a family: the name is the licensee's, who may
      // not be the person on the radio.
      return {
        found: "FCC GMRS record (offline) · licensee",
        notFound: "not in FCC GMRS file",
        updated: "Updated from FCC GMRS file (licensee)",
        button: "Lookup (GMRS file)",
      };
  }
}

/** Shown when a GMRS call sign is entered but the GMRS file isn't downloaded (CALLDIR-044). */
export const GMRS_FILE_MISSING = "GMRS lookup needs the GMRS file — Settings → Offline data";

/** The FCC record in the same shape QRZ results use, so callers fill fields one way. */
function fromFcc(r: OfflineCallRecord): QrzLookupResponse {
  const cityState = [r.city, r.state].filter(Boolean).join(", ");
  // "214 S. Main St, Roscommon, MI 48653": the same shape a QRZ address has,
  // and the ZIP in it is what places the map pin. With no street on file
  // it's just "Roscommon, MI 48653", which still carries the ZIP.
  const address = [r.street, [cityState, r.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    call_sign: r.call,
    name: r.name || null,
    qth_location: cityState || null,
    // The FCC file has no grid square or exact position.
    grid_square: null,
    address: address || null,
    exact_lat: null,
    exact_lon: null,
    geoloc: null,
  };
}

/**
 * Looks a call sign up. A GMRS call sign goes only to the offline GMRS file,
 * since QRZ and the amateur file hold amateur licenses only. Anything else:
 * QRZ first, and only when QRZ isn't available (not set up, offline, or
 * erroring) the offline amateur file. A call sign QRZ simply doesn't know
 * stays "not found" — QRZ was reachable, so the FCC file isn't consulted.
 */
export async function lookupCallsign(call: string, qrzConfigured: boolean): Promise<CallsignLookup> {
  if (callSignService(call) === "gmrs") {
    const offline = await api.lookupCallsignOffline(call, "gmrs").catch(() => null);
    if (!offline?.installed) return { kind: "missing_file", service: "gmrs" };
    return offline.record
      ? {
          kind: "found",
          source: "gmrs",
          data: fromFcc(offline.record),
          fileLacksStreet: !offline.has_street_addresses,
        }
      : { kind: "not_found", source: "gmrs" };
  }
  let qrzError: unknown = QRZ_ERR_NOT_CONFIGURED;
  if (qrzConfigured) {
    try {
      const r = await api.lookupQrzCallsign(call);
      return r ? { kind: "found", source: "qrz", data: r } : { kind: "not_found", source: "qrz" };
    } catch (e) {
      qrzError = e;
    }
  }
  const offline = await api.lookupCallsignOffline(call, "amateur").catch(() => null);
  if (offline?.installed) {
    return offline.record
      ? {
          kind: "found",
          source: "fcc",
          data: fromFcc(offline.record),
          fileLacksStreet: !offline.has_street_addresses,
        }
      : { kind: "not_found", source: "fcc" };
  }
  return { kind: "unavailable", error: qrzError };
}
