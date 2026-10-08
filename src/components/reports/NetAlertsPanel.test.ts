import { describe, expect, it } from "vitest";
import { alertLines } from "./NetAlertsPanel";
import type { ActivityAlert } from "../../types";

const kept = (nws_id: string, event: string, effective: string): ActivityAlert => ({
  id: `local-${nws_id}`,
  nws_id,
  event,
  headline: "",
  area_desc: "",
  severity: "",
  effective,
  ends: "",
  attached_at: "",
});

describe("alertLines (SPOT-060)", () => {
  it("lists an alert once whether it's attached, in effect, or both", () => {
    const lines = alertLines(
      [kept("w1", "Tornado Warning", "2026-10-05T23:30:00Z"), kept("old", "Tornado Watch", "2026-10-05T20:00:00Z")],
      [
        { id: "w1", event: "Tornado Warning", onset: "2026-10-05T23:30:00Z" },
        { id: "f1", event: "Flood Advisory", effective: "2026-10-05T22:00:00Z" },
      ]
    );
    expect(lines.map((l) => [l.key, !!l.attached, !!l.live])).toEqual([
      ["old", true, false],
      ["f1", false, true],
      ["w1", true, true],
    ]);
  });
});
