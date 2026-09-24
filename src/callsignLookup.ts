import * as api from "./api";
import type { OfflineCallRecord, QrzLookupResponse } from "./types";
import { QRZ_ERR_NOT_CONFIGURED } from "./types";

export type CallsignSource = "qrz" | "fcc";

export type CallsignLookup =
  | {
      kind: "found";
      source: CallsignSource;
      data: QrzLookupResponse;
      /** FCC file predates street addresses, so the address is only city/state/ZIP. */
      fileLacksStreet?: boolean;
    }
  | { kind: "not_found"; source: CallsignSource }
  /** Neither QRZ nor the offline directory could answer. `error` is QRZ's. */
  | { kind: "unavailable"; error: unknown };

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
 * Looks a call sign up: QRZ first, and only when QRZ isn't available (not
 * set up, offline, or erroring) the offline FCC directory. A call sign QRZ
 * simply doesn't know stays "not found" — QRZ was reachable, so the FCC file
 * isn't consulted.
 */
export async function lookupCallsign(call: string, qrzConfigured: boolean): Promise<CallsignLookup> {
  let qrzError: unknown = QRZ_ERR_NOT_CONFIGURED;
  if (qrzConfigured) {
    try {
      const r = await api.lookupQrzCallsign(call);
      return r ? { kind: "found", source: "qrz", data: r } : { kind: "not_found", source: "qrz" };
    } catch (e) {
      qrzError = e;
    }
  }
  const offline = await api.lookupCallsignOffline(call).catch(() => null);
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
