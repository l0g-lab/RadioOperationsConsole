import { describe, expect, it } from "vitest";
import {
  combineScheduledAt,
  formatTimeLines,
  formatContactTime,
  parseContactTime,
  splitScheduledAt,
} from "./utils";

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

describe("parseContactTime / formatContactTime", () => {
  const local = (y: number, mo: number, d: number, h: number, mi: number) =>
    new Date(y, mo - 1, d, h, mi).toISOString();

  it("reads a local date and time and round-trips it", () => {
    const t = parseContactTime("2026-09-14 10:05");
    expect(t).toEqual({ kind: "ok", iso: local(2026, 9, 14, 10, 5) });
    expect(parseContactTime(" 2026-9-4T7:05 ")).toEqual({ kind: "ok", iso: local(2026, 9, 4, 7, 5) });
    expect(formatContactTime(local(2026, 9, 4, 7, 5))).toBe("2026-09-04 07:05:00");
    expect(parseContactTime("2026-09-04 07:05:30")).toEqual({
      kind: "ok",
      iso: new Date(2026, 8, 4, 7, 5, 30).toISOString(),
    });
    expect(formatContactTime(new Date(2026, 8, 4, 7, 5, 30))).toBe("2026-09-04 07:05:30");
  });

  it("takes a time alone as today", () => {
    const today = new Date(2026, 9, 1, 18, 0);
    expect(parseContactTime("9:30", today)).toEqual({ kind: "ok", iso: local(2026, 10, 1, 9, 30) });
    expect(parseContactTime("9:30:15", today)).toEqual({
      kind: "ok",
      iso: new Date(2026, 9, 1, 9, 30, 15).toISOString(),
    });
  });

  it("tells blank apart from unreadable", () => {
    expect(parseContactTime("  ")).toEqual({ kind: "blank" });
    for (const bad of [
      "yesterday",
      "2026-09-14",
      "2026-02-30 10:00",
      "25:00",
      "10:5",
      "10:05:61",
      "14/09/2026 10:05",
    ]) {
      expect(parseContactTime(bad), bad).toEqual({ kind: "invalid" });
    }
    expect(formatContactTime("not a date")).toBe("");
  });
});
