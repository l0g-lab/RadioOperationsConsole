import { describe, expect, it } from "vitest";
import { combineScheduledAt, formatTimeLines, pad2, splitScheduledAt } from "./utils";

describe("pad2", () => {
  it("pads single digits", () => {
    expect(pad2(5)).toBe("05");
  });

  it("leaves two-or-more digits alone", () => {
    expect(pad2(42)).toBe("42");
  });
});

describe("splitScheduledAt / combineScheduledAt", () => {
  it("splits a date-and-time value", () => {
    expect(splitScheduledAt("2026-09-21 19:00")).toEqual({ date: "2026-09-21", time: "19:00" });
  });

  it("splits a date-only value (pre-existing records)", () => {
    expect(splitScheduledAt("2026-09-21")).toEqual({ date: "2026-09-21", time: "" });
  });

  it("splits an empty value", () => {
    expect(splitScheduledAt("")).toEqual({ date: "", time: "" });
    expect(splitScheduledAt("   ")).toEqual({ date: "", time: "" });
  });

  it("accepts a T separator as well as a space", () => {
    expect(splitScheduledAt("2026-09-21T19:00")).toEqual({ date: "2026-09-21", time: "19:00" });
  });

  it("combineScheduledAt is the inverse of splitScheduledAt", () => {
    expect(combineScheduledAt("2026-09-21", "19:00")).toBe("2026-09-21 19:00");
    expect(combineScheduledAt("2026-09-21", "")).toBe("2026-09-21");
    expect(combineScheduledAt("", "19:00")).toBe("");
  });

  it("trims whitespace from both parts", () => {
    expect(combineScheduledAt("  2026-09-21  ", "  19:00  ")).toBe("2026-09-21 19:00");
  });
});

describe("formatTimeLines", () => {
  it("parses Unix seconds and shows both local and UTC", () => {
    const lines = formatTimeLines("1758000000");
    expect(lines.local).toMatch(/^Local: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(lines.utc).toBe("UTC: 2025-09-16 05:20:00");
  });

  it("parses an RFC 3339 timestamp", () => {
    const lines = formatTimeLines("2026-09-21T23:04:00Z");
    expect(lines.utc).toBe("UTC: 2026-09-21 23:04:00");
  });

  it("falls back to the raw string for unparseable input, with an empty UTC line", () => {
    const lines = formatTimeLines("not a date");
    expect(lines).toEqual({ local: "not a date", utc: "" });
  });
});
