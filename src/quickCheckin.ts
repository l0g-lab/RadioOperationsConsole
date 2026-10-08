import * as api from "./api";
import { lookupCallsign } from "./callsignLookup";
import { canLookUpOnline, placeCheckinLater, resolveCheckinLocation } from "./checkinLocation";
import type { MapPoint } from "./mapPoints";

/**
 * Checks a station in by call sign alone, as the check-in form would with
 * nothing else typed: its name and location from a call-sign lookup, placed
 * on the map the same way. For a report from a station not yet checked in
 * (SPOT-025). Returns the new check-in's id.
 */
export async function checkInCallSign(
  activityId: string,
  callSign: string,
  operatorId: string | null,
  qrzConfigured: boolean,
  /** What they called in, as the line's traffic. */
  traffic: string | null = null,
  /** Where the net is: an address not placed exactly is looked up near it. */
  near: MapPoint | null = null
): Promise<string> {
  const call = callSign.trim().toUpperCase();
  const outcome = await lookupCallsign(call, qrzConfigured).catch(() => null);
  const found = outcome?.kind === "found" ? outcome.data : null;
  const text = found ? found.address || found.qth_location || "" : "";
  const loc = await resolveCheckinLocation(text, {
    lookup: found
      ? {
          text,
          qth: found.qth_location,
          grid: found.grid_square,
          exact: found.exact_lat != null && found.exact_lon != null ? { lat: found.exact_lat, lon: found.exact_lon } : null,
        }
      : null,
    online: canLookUpOnline(),
  });
  const id = await api.createCheckin(
    activityId,
    call,
    found?.name || null,
    loc.qth,
    loc.grid,
    loc.address,
    operatorId,
    loc.lat,
    loc.lon,
    loc.label,
    !!traffic,
    traffic,
    null,
    loc.manual
  );
  placeCheckinLater(id, text, loc, near);
  return id;
}
