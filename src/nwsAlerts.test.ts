import { describe, expect, it } from "vitest";
import {
  alertLevel,
  alertSpanText,
  areaText,
  attachedAlertText,
  paragraphs,
  sortAlerts,
  toAttachedAlert,
  untilText,
} from "./nwsAlerts";

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

describe("attached alerts (SPOT-060)", () => {
  // Local times, so the test reads the same in any time zone.
  const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).toISOString();

  it("keeps NWS's id, and when the hazard begins and ends over when the message does", () => {
    const a = toAttachedAlert({
      id: "urn:oid:1",
      event: "Tornado Warning",
      areaDesc: "Orange, FL",
      effective: at(5, 19, 28),
      onset: at(5, 19, 30),
      expires: at(5, 20, 0),
      ends: at(5, 20, 15),
    });
    expect(a).toMatchObject({ nws_id: "urn:oid:1", effective: at(5, 19, 30), ends: at(5, 20, 15), area_desc: "Orange, FL" });
    expect(toAttachedAlert({ effective: at(5, 19, 28), expires: at(5, 20, 0) })).toMatchObject({
      nws_id: "",
      event: "Alert",
      effective: at(5, 19, 28),
      ends: at(5, 20, 0),
    });
  });

  it("says when it was in effect, with the end's date only when it's another day", () => {
    expect(alertSpanText(at(5, 19, 30), at(5, 20, 15))).toBe("2026-10-05 19:30 to 20:15");
    expect(alertSpanText(at(5, 22, 0), at(6, 4, 0))).toBe("2026-10-05 22:00 to 2026-10-06 04:00");
    expect(alertSpanText("", at(6, 4, 0))).toBe("until 2026-10-06 04:00");
    expect(alertSpanText(at(5, 22, 0), "")).toBe("from 2026-10-05 22:00");
    expect(alertSpanText("", "")).toBe("");
  });

  it("reads as one line for the summary", () => {
    expect(
      attachedAlertText({
        event: "Tornado Warning",
        area_desc: "Orange, FL; Seminole, FL",
        effective: at(5, 19, 30),
        ends: at(5, 20, 15),
      })
    ).toBe("Tornado Warning — Orange, Seminole — 2026-10-05 19:30 to 20:15");
  });
});
