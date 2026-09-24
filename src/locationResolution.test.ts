import { describe, expect, it } from "vitest";
import { resolveOfflineLocation } from "./locationResolution";
import type { ZipCentroidTable } from "./zipLookup";

const zipTable: ZipCentroidTable = { "80202": [39.75, -104.99] };

describe("resolveOfflineLocation: priority order", () => {
  it("prefers already-known exact coordinates over everything else", () => {
    const r = resolveOfflineLocation(
      {
        lat: 1,
        lon: 2,
        qrzLat: 3,
        qrzLon: 4,
        address: "Denver, CO 80202",
        gridSquare: "DM79",
      },
      zipTable
    );
    expect(r).toEqual({ lat: 1, lon: 2, source: "typed_coords", sourceText: "1, 2" });
  });

  it("prefers QRZ's exact point over a ZIP or grid square", () => {
    const r = resolveOfflineLocation(
      { qrzLat: 3, qrzLon: 4, address: "Denver, CO 80202", gridSquare: "DM79" },
      zipTable
    );
    expect(r).toEqual({ lat: 3, lon: 4, source: "qrz_exact", sourceText: "3, 4" });
  });

  it("falls back to the ZIP centroid over a grid square", () => {
    const r = resolveOfflineLocation({ address: "Denver, CO 80202", gridSquare: "DM79" }, zipTable);
    expect(r).toEqual({ lat: 39.75, lon: -104.99, source: "zip_centroid", sourceText: "80202" });
  });

  it("checks the QTH location for a ZIP when the address has none", () => {
    const r = resolveOfflineLocation({ qthLocation: "Denver, CO 80202" }, zipTable);
    expect(r?.source).toBe("zip_centroid");
  });

  it("falls back to the grid square when there's no ZIP match", () => {
    const r = resolveOfflineLocation({ gridSquare: "DM79" }, zipTable);
    expect(r?.source).toBe("grid_square");
    expect(r?.sourceText).toBe("DM79");
  });

  it("falls back to the grid square when there's no ZIP table loaded", () => {
    const r = resolveOfflineLocation({ address: "Denver, CO 80202", gridSquare: "DM79" }, null);
    expect(r?.source).toBe("grid_square");
  });

  it("returns null when nothing resolves", () => {
    expect(resolveOfflineLocation({}, zipTable)).toBeNull();
    expect(resolveOfflineLocation({ address: "no zip here" }, zipTable)).toBeNull();
  });

  it("ignores a ZIP not present in the table and falls through to the grid square", () => {
    const r = resolveOfflineLocation({ address: "Nowhere, XX 00000", gridSquare: "DM79" }, zipTable);
    expect(r?.source).toBe("grid_square");
  });

  it("ignores an unparseable grid square (returns null rather than throwing)", () => {
    expect(resolveOfflineLocation({ gridSquare: "not a grid" }, zipTable)).toBeNull();
  });
});
