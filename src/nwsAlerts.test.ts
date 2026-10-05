import { describe, expect, it } from "vitest";
import { alertLevel, areaText, paragraphs, sortAlerts, untilText } from "./nwsAlerts";

describe("alertLevel", () => {
  it("marks warnings red and everything else amber", () => {
    expect(alertLevel("Severe Thunderstorm Warning")).toBe("danger");
    expect(alertLevel("Extreme Wind Warning")).toBe("danger");
    expect(alertLevel("Tornado Watch")).toBe("warning");
    expect(alertLevel("Flood Advisory")).toBe("warning");
    expect(alertLevel("Special Weather Statement")).toBe("warning");
  });
});

describe("sortAlerts", () => {
  it("puts warnings first, then the more severe, then the soonest to end", () => {
    const sorted = sortAlerts([
      { event: "Flood Advisory", severity: "Minor", expires: "2026-10-05T21:45:00Z" },
      { event: "Tornado Watch", severity: "Severe", expires: "2026-10-06T01:00:00Z" },
      { event: "Flood Warning", severity: "Moderate", expires: "2026-10-06T03:00:00Z" },
      { event: "Severe Thunderstorm Warning", severity: "Severe", expires: "2026-10-05T20:00:00Z" },
      { event: "Heat Advisory", severity: "Minor", expires: "2026-10-05T20:00:00Z" },
    ]);
    expect(sorted.map((a) => a.event)).toEqual([
      "Severe Thunderstorm Warning",
      "Flood Warning",
      "Tornado Watch",
      "Heat Advisory",
      "Flood Advisory",
    ]);
  });
});

describe("untilText", () => {
  const now = new Date(2026, 9, 5, 15, 30);
  it("gives the time today, and the weekday on another day, preferring when the hazard ends", () => {
    expect(untilText({ expires: new Date(2026, 9, 5, 16, 0).toISOString() }, now)).toBe("until 16:00");
    expect(untilText({ expires: new Date(2026, 9, 6, 8, 5).toISOString() }, now)).toBe("until Tue 08:05");
    expect(
      untilText({ expires: new Date(2026, 9, 5, 16, 0).toISOString(), ends: new Date(2026, 9, 5, 18, 0).toISOString() }, now)
    ).toBe("until 18:00");
    expect(untilText({}, now)).toBe("");
  });
});

describe("paragraphs", () => {
  it("keeps NWS paragraphs and unwraps their lines", () => {
    expect(paragraphs("At 312 PM EDT, a storm was\nnear Pine Hills.\n\nHAZARD...60 mph wind gusts.\n")).toEqual([
      "At 312 PM EDT, a storm was near Pine Hills.",
      "HAZARD...60 mph wind gusts.",
    ]);
    expect(paragraphs(undefined)).toEqual([]);
  });
});

describe("areaText", () => {
  it("drops the state when every county is in the same one", () => {
    expect(areaText("Orange, FL; Seminole, FL")).toBe("Orange, Seminole");
    expect(areaText("Camden, GA; Nassau, FL")).toBe("Camden, GA; Nassau, FL");
    expect(areaText("Coastal Volusia")).toBe("Coastal Volusia");
  });
});
