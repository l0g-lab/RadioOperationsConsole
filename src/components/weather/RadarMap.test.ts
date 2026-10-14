import { describe, expect, it } from "vitest";
import { frameLabel } from "./RadarMap";

describe("frameLabel (RADAR-011)", () => {
  it("gives a scan's local time and how long ago", () => {
    const now = new Date(2026, 9, 5, 19, 46);
    expect(frameLabel(new Date(2026, 9, 5, 19, 42).toISOString(), now)).toBe("19:42, 4 min ago");
    expect(frameLabel(new Date(2026, 9, 5, 19, 45, 50).toISOString(), now)).toBe("19:45, just now");
    expect(frameLabel(new Date(2026, 9, 5, 10, 50).toISOString(), now)).toBe("10:50, 8 h 56 min ago");
    expect(frameLabel("nonsense", now)).toBe("");
  });
});
