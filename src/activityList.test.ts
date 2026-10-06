import { describe, expect, it } from "vitest";
import type { Activity } from "./types";
import { activitySections, activityRow, agoText, recordText, searchActivities } from "./activityList";

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
    record_count: 0,
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
  activity("u2", "SET Drill", "relay", "scheduled", { scheduled_at: "2026-10-10", event_id: "ev9", event: "ARRL SET" }),
  activity("u3", "Ad-hoc", "simple_net", "scheduled"),
  activity("u4", "Morning Net", "simple_net", "scheduled", { scheduled_at: "2026-10-01 11:30" }),
  activity("o1", "Storm Net", "skywarn", "active", { opened_at: new Date(2026, 9, 1, 11, 2).toISOString(), frequency: "146.940" }),
  activity("l1", "VHF Simplex", "station_log", "scheduled"),
  activity("l2", "HF Log", "station_log", "closed"),
];

const ids = (rows: { activity: Activity }[]) => rows.map((r) => r.activity.id);

const sectionIds = (acts: Activity[]) =>
  activitySections(acts, NOW).map((s) => [s.id, ids(s.rows)] as [string, string[]]);

describe("activitySections (UX-OPS-015)", () => {
  it("lists what's happening in order: open, coming up, station logs, closed (folded)", () => {
    expect(sectionIds(ACTS)).toEqual([
      ["open", ["o1"]],
      // u2 is in an event, so it's in the event's block rather than Coming up.
      ["event:ev9", ["u2"]],
      ["upcoming", ["u4", "u1", "u3"]],
      ["logs", ["l1"]],
      ["closed", ["c2", "c1", "l2"]],
    ]);
  });

  it("gives each event its own block in running order, under way first, over ones last and folded", () => {
    const set = (id: string, title: string, state: string, at: string) =>
      activity(id, title, "directed_net", state, { scheduled_at: at, event_id: "ev1", event: "ARRL SET" });
    const done = (id: string, at: string) =>
      activity(id, "Drill", "relay", "closed", { scheduled_at: at, event_id: "ev2", event: "Spring Drill" });
    const acts = [
      activity("o1", "Storm Net", "skywarn", "active"),
      set("e3", "HF relays", "scheduled", "2026-10-01 14:00"),
      set("e1", "Ham net", "closed", "2026-10-01 09:00"),
      set("e2", "GMRS net", "active", "2026-10-01 10:00"),
      done("d1", "2026-04-01 10:00"),
    ];
    const sections = activitySections(acts, NOW);
    expect(sections.map((s) => [s.id, ids(s.rows)])).toEqual([
      ["open", ["o1"]],
      ["event:ev1", ["e1", "e2", "e3"]],
      ["event:ev2", ["d1"]],
    ]);
    const [, event, over] = sections;
    expect(event).toMatchObject({ title: "ARRL SET", summary: "Thu 10/1 · 1 open · 1 to go · 1 done", live: true, folded: false });
    expect(over).toMatchObject({ title: "Spring Drill", live: false, folded: true });
  });

  it("puts nets whose day passed without starting at the end of Coming up", () => {
    const stale = activity("s1", "Forgotten Net", "directed_net", "scheduled", { scheduled_at: "2026-09-10 19:00" });
    const upcoming = activitySections([...ACTS, stale], NOW).find((s) => s.id === "upcoming")!;
    expect(ids(upcoming.rows)).toEqual(["u4", "u1", "u3", "s1"]);
  });
});

describe("searchActivities", () => {
  it("searches everything by title, event, type, or frequency, current ones first", () => {
    expect(ids(searchActivities(ACTS, "tuesday", NOW))).toEqual(["u1", "c2", "c1"]);
    expect(ids(searchActivities(ACTS, "arrl set", NOW))).toEqual(["u2"]);
    expect(ids(searchActivities(ACTS, "skywarn", NOW))).toEqual(["o1"]);
    expect(ids(searchActivities(ACTS, "146.94", NOW))).toEqual(["o1"]);
    expect(searchActivities(ACTS, "  ", NOW)).toEqual([]);
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

describe("nets whose day passed without starting", () => {
  it("say how long ago, in amber", () => {
    const stale = activity("s1", "Forgotten Net", "directed_net", "scheduled", { scheduled_at: "2026-09-10 19:00" });
    const yesterday = activity("s2", "Last Night", "directed_net", "scheduled", { scheduled_at: "2026-09-30 19:00" });
    expect(activityRow(stale, NOW)).toMatchObject({ state: "Not started", ago: "3 wk ago", tone: "due" });
    expect(activityRow(yesterday, NOW).ago).toBe("1 day ago");
  });

  it("counts ago in days, then weeks, then months", () => {
    expect(agoText(new Date(2026, 8, 25), NOW)).toBe("6 days ago");
    expect(agoText(new Date(2026, 8, 1), NOW)).toBe("4 wk ago");
    expect(agoText(new Date(2026, 6, 1), NOW)).toBe("3 mo ago");
  });
});

describe("recordText", () => {
  it("names the records by what they are", () => {
    expect(recordText({ ...ACTS[0], record_count: 14 })).toBe("14 check-ins");
    expect(recordText({ ...ACTS[7], record_count: 1 })).toBe("1 contact");
    expect(recordText({ ...ACTS[3], record_count: 3 })).toBe("3 messages");
  });
});
