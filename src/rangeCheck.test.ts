import { describe, expect, it } from "vitest";
import {
  EMPTY_RANGE,
  missingMessage,
  missingRangeFields,
  rangeDraftFromCheckin,
  toRangeContact,
  type RangeDraft,
} from "./rangeCheck";
import type { Checkin } from "./types";

const COMPLETE: RangeDraft = {
  crossStreet: " Colonial & Mills ",
  lat: 28.55,
  lon: -81.35,
  stationKind: "mobile",
  antenna: "",
  power: "50 W",
  weHear: "Full quieting",
  theyHear: "Slight noise",
  notes: "",
};

describe("missingRangeFields (RANGE-011)", () => {
  it("names everything a blank report lacks, in form order", () => {
    expect(missingMessage(missingRangeFields(EMPTY_RANGE))).toBe(
      "Still needed: cross street, point on the map, station type, power, how we hear them, how they hear the repeater."
    );
  });

  it("passes a complete report; blank text counts as missing", () => {
    expect(missingRangeFields(COMPLETE)).toEqual([]);
    expect(missingRangeFields({ ...COMPLETE, power: "  " })).toEqual(["power"]);
    expect(missingRangeFields({ ...COMPLETE, lon: null })).toEqual(["point"]);
  });

  it("asks for an antenna only from a base station (RANGE-010)", () => {
    expect(missingRangeFields({ ...COMPLETE, stationKind: "base" })).toEqual(["antenna"]);
    expect(missingRangeFields({ ...COMPLETE, stationKind: "ht" })).toEqual([]);
  });
});

describe("toRangeContact", () => {
  it("maps the reports onto sent/received and trims text", () => {
    expect(toRangeContact(COMPLETE)).toEqual({
      station_kind: "mobile",
      cross_street: "Colonial & Mills",
      antenna: null,
      power: "50 W",
      rst_sent: "Full quieting",
      rst_received: "Slight noise",
      notes: null,
    });
  });

  it("drops the antenna unless the station is a base (RANGE-012)", () => {
    expect(toRangeContact({ ...COMPLETE, antenna: "Mag mount" }).antenna).toBeNull();
    expect(toRangeContact({ ...COMPLETE, stationKind: "base", antenna: "X50" }).antenna).toBe("X50");
  });

  it("round-trips through a saved check-in", () => {
    const saved = {
      cross_street: "Colonial & Mills",
      location_lat: 28.55,
      location_lon: -81.35,
      station_kind: "mobile",
      antenna: "",
      power: "50 W",
      rst_sent: "Full quieting",
      rst_received: "Slight noise",
      notes: "",
    } as Checkin;
    expect(rangeDraftFromCheckin(saved)).toEqual({ ...COMPLETE, crossStreet: "Colonial & Mills" });
  });
});
