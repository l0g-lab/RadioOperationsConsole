import { afterEach, describe, expect, it } from "vitest";
import {
  formatAxis,
  formatCoords,
  formatCoordsWithGrid,
  formatDistance,
  getCoordFormat,
  haversineKm,
  parseAxis,
  parseCoords,
  setCoordFormat,
} from "./geo";

afterEach(() => {
  // Each test's chosen display format shouldn't leak into the next one.
  setCoordFormat("dd");
});

describe("haversineKm / kmToMiles / formatDistance", () => {
  it("is zero for identical points", () => {
    expect(haversineKm(39.7, -104.9, 39.7, -104.9)).toBeCloseTo(0, 6);
  });

  it("matches the well-known Denver-to-Boulder-ish distance within a percent", () => {
    // Denver (39.7392,-104.9903) to Boulder (40.0150,-105.2705) is ~38.5 km.
    const km = haversineKm(39.7392, -104.9903, 40.015, -105.2705);
    expect(km).toBeCloseTo(38.5, 0);
  });

  it("formatDistance shows both units", () => {
    expect(formatDistance(10)).toBe("10.0 km (6.2 mi)");
  });
});

describe("formatAxis / formatCoords in each display format", () => {
  const lat = 39.73915;
  const lon = -104.9903;

  it("decimal degrees", () => {
    expect(formatAxis(lat, "lat", "dd")).toBe("39.73915");
    expect(formatAxis(lon, "lon", "dd")).toBe("-104.99030");
    expect(formatCoords(lat, lon, "dd")).toBe("39.73915, -104.99030");
  });

  it("degrees and decimal minutes, with hemisphere letters", () => {
    expect(formatAxis(lat, "lat", "ddm")).toBe("39°44.349′N");
    expect(formatAxis(lon, "lon", "ddm")).toBe("104°59.418′W");
  });

  it("degrees, minutes, seconds, with hemisphere letters", () => {
    expect(formatAxis(lat, "lat", "dms")).toBe("39°44′20.9″N");
    expect(formatAxis(lon, "lon", "dms")).toBe("104°59′25.1″W");
  });

  it("carries a rounded-up seconds value into the minute (59.9996′ -> next degree)", () => {
    // Just under 40°, close enough to 60 decimal minutes to round up.
    const justUnder40 = 39 + 59.9996 / 60;
    expect(formatAxis(justUnder40, "lat", "ddm")).toBe("40°0.000′N");
  });

  it("formatCoords defaults to the persisted display format", () => {
    setCoordFormat("dms");
    expect(getCoordFormat()).toBe("dms");
    expect(formatCoords(lat, lon)).toBe(formatCoords(lat, lon, "dms"));
  });
});

describe("formatCoordsWithGrid", () => {
  it("appends the Maidenhead grid square", () => {
    expect(formatCoordsWithGrid(39.73915, -104.9903)).toBe("39.73915, -104.99030 (DM79mr)");
  });
});

describe("parseCoords: accepted formats all resolve to the same point", () => {
  const expected = { lat: 39.73915, lon: -104.9903 };
  const near = (got: { lat: number; lon: number } | null, digits = 4) => {
    expect(got).not.toBeNull();
    expect(got!.lat).toBeCloseTo(expected.lat, digits);
    expect(got!.lon).toBeCloseTo(expected.lon, digits);
  };

  it("decimal degrees, comma-separated", () => {
    near(parseCoords("39.73915, -104.9903"));
  });

  it("decimal degrees, space-separated", () => {
    near(parseCoords("39.73915 -104.9903"));
  });

  it("degrees/minutes/seconds with symbols and hemisphere letters", () => {
    near(parseCoords("39°44′20.94″N, 104°59′25.08″W"));
  });

  it("degrees/minutes/seconds with no symbols", () => {
    near(parseCoords("39 44 20.94 N 104 59 25.08 W"));
  });

  it("leading hemisphere letters", () => {
    near(parseCoords("N 39 44 20.94, W 104 59 25.08"));
  });

  it("degrees and decimal minutes", () => {
    near(parseCoords("39°44.349′N 104°59.418′W"), 3);
  });

  it("lat/lon given in either order when hemisphere letters disambiguate", () => {
    near(parseCoords("104°59.418′W, 39°44.349′N"), 3);
  });

  it("round-trips through formatCoords for all three formats", () => {
    for (const fmt of ["dd", "ddm", "dms"] as const) {
      const text = formatCoords(expected.lat, expected.lon, fmt);
      const parsed = parseCoords(text);
      expect(parsed, `format ${fmt}: ${text}`).not.toBeNull();
      expect(parsed!.lat).toBeCloseTo(expected.lat, 3);
      expect(parsed!.lon).toBeCloseTo(expected.lon, 3);
    }
  });
});

describe("parseCoords: rejected input", () => {
  it("out-of-range latitude", () => {
    expect(parseCoords("91, 0")).toBeNull();
  });

  it("minutes/seconds of 60 or more", () => {
    expect(parseCoords("39 75 N 104 W")).toBeNull();
  });

  it("garbage text", () => {
    expect(parseCoords("abc")).toBeNull();
  });

  it("two hemisphere letters that can't both be latitude", () => {
    expect(parseCoords("39.7 N 104.9 N")).toBeNull();
  });

  it("a lone number with no comma or hemisphere", () => {
    expect(parseCoords("39.7")).toBeNull();
  });
});

describe("parseAxis", () => {
  it("parses a single latitude or longitude", () => {
    expect(parseAxis("-104.99", "lon")).toBeCloseTo(-104.99, 5);
    expect(parseAxis("104°59′25″W", "lon")).toBeCloseTo(-104.9903, 3);
  });

  it("rejects a hemisphere letter that doesn't match the requested axis", () => {
    expect(parseAxis("39N", "lon")).toBeNull();
  });

  it("rejects a value outside the axis's range", () => {
    expect(parseAxis("91", "lat")).toBeNull();
    expect(parseAxis("181", "lon")).toBeNull();
  });
});
