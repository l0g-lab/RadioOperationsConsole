import { describe, expect, it } from "vitest";
import type { Activity } from "./types";
import { eventSpan, eventStatus, nextInEvent, relativeTime } from "./events";

const act = (id: string, state: string, scheduled_at = "", event_id = "set"): Activity =>
  ({ id, title: id, state, scheduled_at, event_id, opened_at: "", closed_at: "" }) as Activity;
const at = (h: number, m: number) => new Date(2026, 9, 4, h, m).getTime();

describe("nextInEvent", () => {
  const current = act("ham", "active", "2026-10-04 09:00");
  const all = [
    current,
    act("gmrs", "scheduled", "2026-10-04 09:30"),
    act("hf", "scheduled", "2026-10-04 10:30"),
    act("undated", "scheduled"),
    act("done", "closed", "2026-10-04 09:15"),
    act("other", "scheduled", "2026-10-04 09:20", "other"),
  ];

  it("is the soonest activity in the same event that hasn't started", () => {
    expect(nextInEvent(all, current, at(9, 20))?.activity.id).toBe("gmrs");
    expect(nextInEvent(all.filter((a) => a.id !== "gmrs" && a.id !== "hf"), current, at(9, 20))?.activity.id).toBe(
      "undated"
    );
    expect(nextInEvent(all, act("solo", "active", "", ""), at(9, 0))).toBeNull();
  });

  it("is only due within 15 minutes of its time, or once it's late", () => {
    expect(nextInEvent(all, current, at(8, 35))?.due).toBe(false); // 55 min early
    expect(nextInEvent(all, current, at(9, 20))?.due).toBe(true); // 10 min early
    expect(nextInEvent(all, current, at(9, 45))?.due).toBe(true); // late
    const undatedOnly = [current, act("undated", "scheduled")];
    expect(nextInEvent(undatedOnly, current, at(9, 0))?.due).toBe(false);
  });
});

describe("relativeTime", () => {
  it("says how far off, in words", () => {
    expect(relativeTime(at(9, 30), at(8, 35))).toBe("in 55 min");
    expect(relativeTime(at(11, 35), at(9, 30))).toBe("in 2 h 5 min");
    expect(relativeTime(at(9, 30), at(9, 30))).toBe("now");
    expect(relativeTime(at(9, 30), at(9, 42))).toBe("12 min ago");
  });
});

describe("an event's span and status", () => {
  it("runs from its first start to its last end, or to now while it's on", () => {
    const ham = { ...act("ham", "closed"), opened_at: new Date(at(9, 0)).toISOString(), closed_at: new Date(at(9, 25)).toISOString() };
    const gmrs = act("gmrs", "scheduled", "2026-10-04 09:30");
    expect(eventSpan([ham], at(12, 0))).toEqual({ from: new Date(at(9, 0)).toISOString(), to: new Date(at(9, 25)).toISOString() });
    expect(eventSpan([ham, gmrs], at(9, 26))?.to).toBe(new Date(at(9, 30)).toISOString());
    expect(eventSpan([act("x", "scheduled")])).toBeNull();
    expect([eventStatus([]), eventStatus([gmrs]), eventStatus([ham, gmrs]), eventStatus([ham])]).toEqual([
      "empty",
      "upcoming",
      "on",
      "finished",
    ]);
  });
});
