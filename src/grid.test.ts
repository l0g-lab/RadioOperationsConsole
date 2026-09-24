import { describe, expect, it } from "vitest";
import { gridSquareToLatLon, latLonToGridSquare } from "./grid";

describe("latLonToGridSquare / gridSquareToLatLon", () => {
  it("round-trips a known point to 6-character precision", () => {
    // Denver, CO — a widely-cited reference point for Maidenhead locators.
    const grid = latLonToGridSquare(39.73915, -104.9903);
    expect(grid).toBe("DM79mr");

    const back = gridSquareToLatLon(grid);
    expect(back).not.toBeNull();
    expect(back!.lat).toBeCloseTo(39.73915, 1);
    expect(back!.lon).toBeCloseTo(-104.9903, 1);
  });

  it("accepts lowercase and surrounding whitespace", () => {
    expect(gridSquareToLatLon("  dm79lr  ")).toEqual(gridSquareToLatLon("DM79LR"));
  });

  it("supports 4-character (field+square) precision", () => {
    const loc = gridSquareToLatLon("DM79");
    expect(loc).not.toBeNull();
    expect(loc!.lat).toBeCloseTo(39.5, 5);
    expect(loc!.lon).toBeCloseTo(-105, 5);
  });

  it("supports 8-character (extended) precision", () => {
    const loc = gridSquareToLatLon("DM79lr55");
    expect(loc).not.toBeNull();
    // Should be within the 6-char cell, refined further.
    const coarse = gridSquareToLatLon("DM79lr")!;
    expect(Math.abs(loc!.lat - coarse.lat)).toBeLessThan(1 / 24);
    expect(Math.abs(loc!.lon - coarse.lon)).toBeLessThan(2 / 24);
  });

  it("rejects malformed input instead of throwing", () => {
    expect(gridSquareToLatLon("")).toBeNull();
    expect(gridSquareToLatLon("D")).toBeNull();
    expect(gridSquareToLatLon("DM7")).toBeNull(); // odd length
    expect(gridSquareToLatLon("ZZ99")).toBeNull(); // field out of A-R range
    expect(gridSquareToLatLon("DM7X")).toBeNull(); // non-digit square
  });

  it("wraps antipodal and boundary coordinates without throwing", () => {
    expect(() => latLonToGridSquare(90, 180)).not.toThrow();
    expect(() => latLonToGridSquare(-90, -180)).not.toThrow();
    expect(latLonToGridSquare(-90, -180)).toBe("AA00aa");
  });
});
