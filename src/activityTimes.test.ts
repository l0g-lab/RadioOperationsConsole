import { describe, expect, it } from "vitest";
import type { HistoryEvent } from "./types";
import { previousEnd, suggestedEnd } from "./activityTimes";

const event = (action: string, utc: string): HistoryEvent => ({
  id: action + utc,
  entity_type: "activity",
  entity_id: "a1",
  action,
  data: JSON.stringify({ utc_time: utc }),
  operator: "",
  created_at: utc,
});

describe("ending a reopened net (LIFE-008)", () => {
  const history = [
    event("started", "2026-10-04T00:00:00Z"),
    event("closed", "2026-10-04T00:45:00Z"),
    event("reopened", "2026-10-04T00:47:00Z"),
  ];

  it("finds when it last ended", () => {
    expect(previousEnd(history)).toBe("2026-10-04T00:45:00Z");
    expect(previousEnd(history.slice(0, 1))).toBe("");
  });

  it("suggests the later of the earlier end and the last record", () => {
    // A late check-in moves the end.
    expect(suggestedEnd("2026-10-04T00:45:00Z", ["2026-10-04T00:30:00Z", "2026-10-04T00:48:00Z"])).toBe(
      "2026-10-04T00:48:00.000Z"
    );
    // A correction later, with nothing new, keeps it.
    expect(suggestedEnd("2026-10-04T00:45:00Z", ["2026-10-04T00:30:00Z", ""])).toBe("2026-10-04T00:45:00.000Z");
    // Never ended before: now.
    expect(suggestedEnd("", ["2026-10-04T00:30:00Z"])).toBe("");
  });
});
