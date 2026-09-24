import { describe, expect, it } from "vitest";
import { extractZip, zipCentroidLookup, type ZipCentroidTable } from "./zipLookup";

describe("extractZip", () => {
  it("finds a ZIP right after a two-letter state code", () => {
    expect(extractZip("123 Main St, Springfield, IL 62701")).toBe("62701");
  });

  it("prefers the ZIP+4's base 5 digits", () => {
    expect(extractZip("123 Main St, Springfield, IL 62701-1234")).toBe("62701");
  });

  it("doesn't mistake a house number for a ZIP when a real one follows the state", () => {
    expect(extractZip("62701 Main St, Springfield, IL 60601")).toBe("60601");
  });

  it("falls back to a bare 5-digit number with no state code present", () => {
    expect(extractZip("PO Box 298832, 33029")).toBe("33029");
  });

  it("returns null when there's nothing that looks like a ZIP", () => {
    expect(extractZip("Miami, FL")).toBeNull();
    expect(extractZip("")).toBeNull();
  });
});

describe("zipCentroidLookup", () => {
  const table: ZipCentroidTable = { "80202": [39.7522, -104.9958] };

  it("returns the centroid for a known ZIP", () => {
    expect(zipCentroidLookup(table, "80202")).toEqual({ lat: 39.7522, lon: -104.9958 });
  });

  it("returns null for an unknown ZIP", () => {
    expect(zipCentroidLookup(table, "00000")).toBeNull();
  });
});
