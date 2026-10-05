import { describe, expect, it } from "vitest";
import type { Activity } from "./types";
import { activityRow, activityRows, viewCounts } from "./activityList";

function activity(id: string, title: string, activity_type: string, state: string, extra: Partial<Activity> = {}): Activity {
  return {
    id,
    title,
    activity_type,
    scheduled_at: "",
    frequency: "",
    location_label: "",
    location_lat: null,
    location_lon: null,
    state,
    opened_at: "",
    closed_at: "",
    conclusion: "",
    repeater_name: "",
    repeater_lat: null,
    repeater_lon: null,
    operator_id: "",
    event_id: "",
    event: "",
    ...extra,
  };
}

const NOW = new Date(2026, 9, 1, 12, 0); // Thu 10/1/2026 12:00

const ACTS = [
  activity("c1", "Tuesday Net", "directed_net", "closed", {
    scheduled_at: "2026-09-22 19:00",
    opened_at: new Date(2026, 8, 22, 19, 2).toISOString(),
    closed_at: new Date(2026, 8, 22, 20, 0).toISOString(),
  }),
  activity("c2", "Tuesday Net", "directed_net", "closed", {
    scheduled_at: "2026-09-29 19:00",
    opened_at: new Date(2026, 8, 29, 19, 1).toISOString(),
    closed_at: new Date(2026, 8, 29, 20, 0).toISOString(),
  }),
  activity("u1", "Tuesday Net", "directed_net", "scheduled", { scheduled_at: "2026-10-06 19:00" }),
  activity("u2", "SET Drill", "relay", "scheduled", { scheduled_at: "2026-10-10", event: "ARRL SET" }),
  activity("u3", "Ad-hoc", "simple_net", "scheduled"),
  activity("u4", "Morning Net", "simple_net", "scheduled", { scheduled_at: "2026-10-01 11:30" }),
  activity("o1", "Storm Net", "skywarn", "active", { opened_at: new Date(2026, 9, 1, 11, 2).toISOString(), frequency: "146.940" }),
  activity("l1", "VHF Simplex", "station_log", "scheduled"),
  activity("l2", "HF Log", "station_log", "closed"),
];

const ids = (rows: { activity: Activity }[]) => rows.map((r) => r.activity.id);

describe("activityRows (UX-OPS-015)", () => {
  it("shows what's current: open, then not started soonest first (unscheduled last), then station logs", () => {
    expect(ids(activityRows(ACTS, "current", "", NOW))).toEqual(["o1", "u4", "u1", "u2", "u3", "l1"]);
  });

  it("shows closed ones most recent first, and everything with All", () => {
    expect(ids(activityRows(ACTS, "closed", "", NOW))).toEqual(["c2", "c1", "l2"]);
    expect(activityRows(ACTS, "all", "", NOW)).toHaveLength(ACTS.length);
    expect(viewCounts(ACTS)).toEqual({ current: 6, closed: 3, all: 9 });
  });

  it("searches everything by title, event, type, or frequency, whatever the view", () => {
    expect(ids(activityRows(ACTS, "current", "tuesday", NOW))).toEqual(["u1", "c2", "c1"]);
    expect(ids(activityRows(ACTS, "closed", "arrl set", NOW))).toEqual(["u2"]);
    expect(ids(activityRows(ACTS, "current", "skywarn", NOW))).toEqual(["o1"]);
    expect(ids(activityRows(ACTS, "current", "146.94", NOW))).toEqual(["o1"]);
  });
});

describe("activityRow", () => {
  const row = (id: string) => activityRow(ACTS.find((a) => a.id === id)!, NOW);

  it("says when and what state, in the app's colors", () => {
    expect(row("o1")).toMatchObject({ when: "Thu 10/1 11:02", state: "Open", tone: "open" });
    expect(row("u1")).toMatchObject({ when: "Tue 10/6 19:00", state: "Not started", tone: "plain" });
    expect(row("u2")).toMatchObject({ when: "Sat 10/10", state: "Not started" });
    expect(row("u3")).toMatchObject({ when: "", state: "Not started" });
    expect(row("c2")).toMatchObject({ when: "Tue 9/29 19:01", state: "Closed", tone: "dim" });
    expect(row("l1")).toMatchObject({ when: "", state: "Log", tone: "plain" });
    expect(row("l2")).toMatchObject({ state: "Closed", tone: "dim" });
  });

  it("marks a net whose time has come but hasn't started in amber", () => {
    expect(row("u4")).toMatchObject({ when: "Thu 10/1 11:30", tone: "due" });
  });

  it("gives the year for another year", () => {
    const old = activity("x", "Old", "directed_net", "scheduled", { scheduled_at: "2025-12-30 19:00" });
    expect(activityRow(old, NOW).when).toBe("Tue 12/30/2025 19:00");
  });
});
