import { describe, expect, it } from "vitest";
import { MARKER_SVG } from "./CheckinLocationMap";

describe("map markers (RPT-030)", () => {
  it("draws the repeater and net control as distinct icons", () => {
    expect(MARKER_SVG.repeater).toMatch(/^<svg[^>]*lucide-radio-tower/);
    expect(MARKER_SVG["net-control"]).toMatch(/^<svg[^>]*lucide-radio\b/);
    expect(MARKER_SVG.repeater).not.toBe(MARKER_SVG["net-control"]);
  });
});
