import { describe, expect, it } from "vitest";
import { fallbackFrameTimes, frameLabel, radarImageUrl } from "./RadarMap";

describe("frameLabel (RADAR-011)", () => {
  it("gives a scan's local time and how long ago", () => {
    const now = new Date(2026, 9, 5, 19, 46);
    expect(frameLabel(new Date(2026, 9, 5, 19, 42).toISOString(), now)).toBe("19:42, 4 min ago");
    expect(frameLabel(new Date(2026, 9, 5, 19, 45, 50).toISOString(), now)).toBe("19:45, just now");
    expect(frameLabel(new Date(2026, 9, 5, 10, 50).toISOString(), now)).toBe("10:50, 8 h 56 min ago");
    expect(frameLabel("nonsense", now)).toBe("");
  });
});

describe("fallbackFrameTimes (RADAR-015)", () => {
  it("asks for every two minutes of the last hour, oldest first, ending on the latest even minute", () => {
    const times = fallbackFrameTimes(new Date(Date.UTC(2026, 9, 6, 12, 53, 40)));
    expect(times).toHaveLength(30);
    expect(times[29]).toBe("2026-10-06T12:52:00.000Z");
    expect(times[28]).toBe("2026-10-06T12:50:00.000Z");
    expect(times[0]).toBe("2026-10-06T11:54:00.000Z");
  });
});

describe("radarImageUrl (RADAR-016)", () => {
  it("asks NOAA for one picture of exactly the view, for one scan", () => {
    const url = new URL(radarImageUrl("2026-10-06T12:52:00.000Z", [-9079495.12, 3326539, -8766409, 3639625.56], 534.6, 480));
    expect(url.origin + url.pathname).toBe("https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      REQUEST: "GetMap",
      LAYERS: "conus_bref_qcd",
      CRS: "EPSG:3857",
      FORMAT: "image/png",
      TRANSPARENT: "true",
      WIDTH: "535",
      HEIGHT: "480",
      BBOX: "-9079495.1,3326539.0,-8766409.0,3639625.6",
      TIME: "2026-10-06T12:52:00.000Z",
    });
  });
});
