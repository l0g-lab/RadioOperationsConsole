import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TYPES,
  activityTypeDef,
  activityTypeLabel,
  isLog,
  isRangeCheck,
  visibleSections,
} from "./activityTypes";
import type { ActivitySummary } from "./types";

function summary(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    state: "active",
    opened_at: "",
    closed_at: "",
    conclusion: "",
    checkins: 0,
    unique_stations: 0,
    removed_checkins: 0,
    first_checkin_at: "",
    last_checkin_at: "",
    spotter_reports: 0,
    hazards: [],
    traffic_items: 0,
    open_traffic_items: 0,
    ...overrides,
  };
}

describe("activityTypeDef / activityTypeLabel", () => {
  it("returns the matching definition for a known id", () => {
    expect(activityTypeDef("skywarn").label).toBe("SKYWARN");
    expect(activityTypeLabel("simple_net")).toBe("Simple net");
  });

  it("falls back to 'Other' behavior for an unrecognized id, but keeps that id and a readable label", () => {
    const def = activityTypeDef("ares_races_activation");
    const other = ACTIVITY_TYPES.find((t) => t.id === "other")!;
    expect(def.id).toBe("ares_races_activation");
    expect(def.label).toBe("ares races activation");
    expect(def.sections).toEqual(other.sections);
  });

  it("falls back to the 'Other' label for an empty id", () => {
    expect(activityTypeDef("").label).toBe("Other");
  });
});

describe("visibleSections", () => {
  it("always includes checkins even for a type that doesn't list it", () => {
    // Defensive: no shipped type omits checkins, but the function shouldn't rely on that.
    expect(visibleSections("simple_net", summary()).has("checkins")).toBe(true);
  });

  it("shows only what a simple net emphasizes when there's nothing else", () => {
    expect(visibleSections("simple_net", summary())).toEqual(new Set(["checkins"]));
  });

  it("a simple net still shows traffic once there is any (never hides real data)", () => {
    const shown = visibleSections("simple_net", summary({ traffic_items: 1 }));
    expect(shown.has("traffic")).toBe(true);
  });

  it("a simple net still shows spotter reports once there are any", () => {
    const shown = visibleSections("simple_net", summary({ spotter_reports: 2 }));
    expect(shown.has("spotter")).toBe(true);
  });

  it("directed_net emphasizes checkins and traffic but not spotter reports by default", () => {
    const shown = visibleSections("directed_net", summary());
    expect(shown).toEqual(new Set(["checkins", "traffic"]));
  });

  it("skywarn emphasizes spotter reports even with none recorded yet", () => {
    const shown = visibleSections("skywarn", summary());
    expect(shown.has("spotter")).toBe(true);
  });

  it("an unrecognized type behaves like 'other' (shows everything it has)", () => {
    const shown = visibleSections("some_future_type", summary({ traffic_items: 1, spotter_reports: 1 }));
    expect(shown).toEqual(new Set(["checkins", "traffic", "spotter"]));
  });
});

describe("isLog", () => {
  it("is true only for the station log", () => {
    expect(isLog("station_log")).toBe(true);
    expect(ACTIVITY_TYPES.filter((t) => t.log).map((t) => t.id)).toEqual(["station_log"]);
    expect(isLog("directed_net")).toBe(false);
    expect(isLog("something_newer")).toBe(false);
  });
});

describe("range check (RANGE-001)", () => {
  it("is a type of its own, run as a net rather than a log", () => {
    expect(ACTIVITY_TYPES.map((t) => t.id)).toContain("range_check");
    expect(activityTypeLabel("range_check")).toBe("Range check");
    expect(isRangeCheck("range_check")).toBe(true);
    expect(isLog("range_check")).toBe(false);
    expect(isRangeCheck("directed_net")).toBe(false);
  });
});
