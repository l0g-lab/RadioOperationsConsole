import { describe, expect, it } from "vitest";
import type { AprsIsPacket } from "./types";
import { distanceText, heardAgo, stationKind, stationsFrom, weatherReport } from "./aprs";

const packet = (source: string, minsAgo: number, o: Partial<AprsIsPacket> = {}): AprsIsPacket => ({
  source,
  dest: "APRS",
  path: "WIDE1-1",
  raw: "",
  lat: null,
  lon: null,
  comment: null,
  symbol: null,
  received_at: new Date(Date.UTC(2026, 9, 5, 22, 0) - minsAgo * 60_000).toISOString(),
  ...o,
});

describe("stationKind", () => {
  it("names a station by its APRS symbol", () => {
    expect(stationKind(">")).toMatchObject({ label: "Mobile", group: "moving" });
    expect(stationKind("/-")).toMatchObject({ label: "Home", group: "fixed" });
    expect(stationKind("_")).toMatchObject({ label: "Weather", group: "weather" });
    expect(stationKind("#")).toMatchObject({ label: "Digipeater", group: "infrastructure" });
    expect(stationKind("&")).toMatchObject({ label: "IGate" });
    expect(stationKind("[")).toMatchObject({ label: "On foot" });
    expect(stationKind(null)).toMatchObject({ label: "Station" });
    expect(stationKind("?")).toMatchObject({ label: "Station" });
  });
});

describe("weatherReport", () => {
  it("puts an APRS weather report in words, keeping the text after it", () => {
    expect(weatherReport("275/012g018t088r000p012h78b10142 Davis VP2")).toEqual({
      text: "88°F · wind W 12 mph gusting 18 · humidity 78% · 1014 hPa",
      rest: "Davis VP2",
    });
  });

  it("handles calm, rain, freezing, unknown values, and 100% humidity", () => {
    expect(weatherReport("000/000g000t-05r012h00")?.text).toBe("-5°F · calm · rain 0.12 in last hour · humidity 100%");
    expect(weatherReport(".../...g...t072")?.text).toBe("72°F");
  });

  it("isn't fooled by an ordinary comment", () => {
    expect(weatherReport("Mobile, 146.940 monitoring")).toBeNull();
    expect(weatherReport("")).toBeNull();
    expect(weatherReport(null)).toBeNull();
  });
});

describe("stationsFrom", () => {
  const center = { lat: 28.5383, lon: -81.3792 };

  it("makes one station per call sign, at its latest position, most recently heard first", () => {
    const stations = stationsFrom(
      [
        packet("W4ABC-9", 12, { lat: 28.55, lon: -81.3, symbol: ">", comment: "Mobile" }),
        packet("KO4WX", 2, { lat: 28.45, lon: -81.4, symbol: "_", comment: "275/012g018t088h78b10142" }),
        packet("W4ABC-9", 4, { lat: 28.6, lon: -81.25, symbol: ">", comment: "Mobile" }),
        packet("W4ABC-9", 1, { lat: 28.6, lon: -81.25, symbol: ">" }),
        packet("KM4ZZZ", 20),
      ],
      center
    );
    expect(stations.map((s) => s.call)).toEqual(["W4ABC-9", "KO4WX", "KM4ZZZ"]);
    const [mobile, wx, unplaced] = stations;
    expect(mobile).toMatchObject({ lat: 28.6, lon: -81.25, packets: 3, comment: "Mobile", kind: { label: "Mobile" } });
    expect(mobile.trail).toEqual([
      [28.55, -81.3],
      [28.6, -81.25],
    ]);
    expect(mobile.distance).toMatch(/^\d\.\d mi NE$/);
    expect(wx.comment).toBe("88°F · wind W 12 mph gusting 18 · humidity 78% · 1014 hPa");
    expect(wx.distance).toBe("6.2 mi S");
    expect(unplaced).toMatchObject({ lat: null, distance: "", trail: [] });
  });
});

describe("distanceText and heardAgo", () => {
  it("says how far and which way", () => {
    expect(distanceText(6.8, 45)).toBe("4.2 mi NE");
    expect(distanceText(40, 200)).toBe("25 mi S");
    expect(distanceText(0.05, 0)).toBe("here");
  });

  it("says how long since a station was heard", () => {
    const now = new Date(Date.UTC(2026, 9, 5, 22, 0));
    expect(heardAgo(new Date(now.getTime() - 20_000).toISOString(), now)).toBe("just now");
    expect(heardAgo(new Date(now.getTime() - 4 * 60_000).toISOString(), now)).toBe("4 min ago");
    expect(heardAgo(new Date(now.getTime() - 65 * 60_000).toISOString(), now)).toBe("1 h 5 min ago");
  });
});
