import { describe, expect, it } from "vitest";
import { MARKER_SVG, mapPins } from "./CheckinLocationMap";
import type { Checkin } from "../types";

describe("map markers (RPT-030)", () => {
  it("draws the repeater and net control as distinct icons", () => {
    expect(MARKER_SVG.repeater).toMatch(/^<svg[^>]*lucide-radio-tower/);
    expect(MARKER_SVG["net-control"]).toMatch(/^<svg[^>]*lucide-radio\b/);
    expect(MARKER_SVG.repeater).not.toBe(MARKER_SVG["net-control"]);
  });
});

describe("mapPins (CIMAP-090)", () => {
  const at = (id: string, call: string, time: string, lat: number | null, lon = -81.3) =>
    ({ id, call_sign: call, name: "", checked_in_at: time, location_lat: lat, location_lon: lat == null ? null : lon, location_label: id, cross_street: "", rst_sent: "", rst_received: "", station_kind: "", power: "" }) as Checkin;
  const lines = [
    at("1", "W4ABC", "2026-10-05T19:00:00Z", 28.5),
    at("2", "w4abc", "2026-10-05T19:42:00Z", 28.5),
    at("3", "W4ABC", "2026-10-05T20:10:00Z", 28.6),
    at("4", "KD4XYZ", "2026-10-05T19:05:00Z", null),
  ];

  it("gives a station one pin per spot, showing its latest entry there", () => {
    const { pins, stations, placed } = mapPins(lines, false);
    expect(pins.map((p) => p.checkinId)).toEqual(["2", "3"]);
    expect([stations, placed]).toEqual([2, 1]);
  });

  it("plots every entry of a range check", () => {
    const { pins, stations, placed } = mapPins(lines, true);
    expect(pins).toHaveLength(3);
    expect([stations, placed]).toEqual([4, 3]);
  });
});
