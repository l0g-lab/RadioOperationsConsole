import { describe, expect, it } from "vitest";
import type { Activity } from "../types";
import { topBarActivities } from "./Header";

const act = (id: string, state: string, closed_at = ""): Activity => ({ id, state, closed_at }) as Activity;

describe("topBarActivities", () => {
  it("lists everything not finished, the 10 latest closed, and the selected one", () => {
    const closed = Array.from({ length: 12 }, (_, i) =>
      act(`c${i}`, "closed", `2026-10-${String(i + 1).padStart(2, "0")}T20:00:00Z`)
    );
    const all = [act("open", "active"), act("next", "scheduled"), ...closed];
    const ids = topBarActivities(all, null).map((a) => a.id);
    expect(ids).toContain("open");
    expect(ids).toContain("next");
    expect(ids).toContain("c11");
    expect(ids).not.toContain("c0");
    expect(ids).toHaveLength(12);
    expect(topBarActivities(all, "c0").map((a) => a.id)).toContain("c0");
  });
});
