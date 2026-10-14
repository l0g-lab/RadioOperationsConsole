import { describe, expect, it } from "vitest";
import {
  NATIONAL,
  STATION_ZOOM,
  distanceKm,
  fallbackFrameTimes,
  frameMs,
  radarImageUrl,
  radarSourceFor,
} from "./radarSource";

const BBOX: [number, number, number, number] = [-9079495.12, 3326539, -8766409, 3639625.56];

describe("radarImageUrl (RADAR-016)", () => {
  it("asks NOAA for one picture of exactly the view, for one scan", () => {
    const url = new URL(radarImageUrl(NATIONAL, "2026-10-06T12:52:00.000Z", BBOX, 534.6, 480));
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

  it("asks for as many pixels as the screen shows, within NOAA's limit", () => {
    const sharp = new URL(radarImageUrl(NATIONAL, "t", BBOX, 600, 400, 2));
    expect([sharp.searchParams.get("WIDTH"), sharp.searchParams.get("HEIGHT")]).toEqual(["1200", "800"]);
    const huge = new URL(radarImageUrl(NATIONAL, "t", BBOX, 3000, 1500, 2));
    expect([huge.searchParams.get("WIDTH"), huge.searchParams.get("HEIGHT")]).toEqual(["4096", "2048"]);
  });

  it("asks a station for its super-resolution scans (RADAR-020)", () => {
    const url = new URL(radarImageUrl("kevx", "t", BBOX, 500, 400));
    expect(url.origin + url.pathname).toBe("https://opengeo.ncep.noaa.gov/geoserver/kevx/ows");
    expect(url.searchParams.get("LAYERS")).toBe("kevx_sr_bref");
  });
});

describe("radarSourceFor (RADAR-020)", () => {
  // Eglin AFB (KEVX) is at 30.565, -85.922; Mobile (KMOB) at 30.679, -88.24.
  it("is the national mosaic farther out", () => {
    expect(radarSourceFor(STATION_ZOOM - 1, 30.5, -86)).toBe(NATIONAL);
  });

  it("is the nearest station close in", () => {
    expect(radarSourceFor(STATION_ZOOM, 30.5, -86)).toBe("kevx");
    expect(radarSourceFor(11, 30.7, -88.1)).toBe("kmob");
  });

  it("keeps the station shown while it's still in range, so a pan doesn't flip between two", () => {
    // Nearer KMOB here, but KEVX still covers it.
    expect(radarSourceFor(10, 30.6, -87.3, "kevx")).toBe("kevx");
    expect(radarSourceFor(10, 30.6, -87.3)).toBe("kmob");
  });

  it("is the national mosaic where no station's in range", () => {
    expect(radarSourceFor(12, 40, -40)).toBe(NATIONAL);
  });

  it("measures distance in km", () => {
    expect(distanceKm(30.565, -85.922, 30.679, -88.24)).toBeCloseTo(222, 0);
  });
});

describe("fallbackFrameTimes (RADAR-015)", () => {
  it("asks for every two minutes of the last hour for the mosaic, oldest first", () => {
    const times = fallbackFrameTimes(NATIONAL, new Date(Date.UTC(2026, 9, 6, 12, 53, 40)));
    expect(times).toHaveLength(30);
    expect(times[29]).toBe("2026-10-06T12:52:00.000Z");
    expect(times[28]).toBe("2026-10-06T12:50:00.000Z");
    expect(times[0]).toBe("2026-10-06T11:54:00.000Z");
  });

  it("asks for every five minutes for a station", () => {
    const times = fallbackFrameTimes("kevx", new Date(Date.UTC(2026, 9, 6, 12, 53, 40)));
    expect(times).toHaveLength(12);
    expect(times[11]).toBe("2026-10-06T12:50:00.000Z");
  });
});

describe("frameMs", () => {
  it("loops the hour in about ten seconds, within limits", () => {
    expect(frameMs(30)).toBe(333);
    expect(frameMs(14)).toBe(714);
    expect(frameMs(7)).toBe(800);
    expect(frameMs(60)).toBe(330);
  });
});
