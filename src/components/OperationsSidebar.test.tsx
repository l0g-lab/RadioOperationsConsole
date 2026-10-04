import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { Activity } from "../types";
import OperationsSidebar, { groupActivities } from "./OperationsSidebar";

function activity(
  id: string,
  title: string,
  activity_type: string,
  state: string,
  extra: Partial<Activity> = {}
): Activity {
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
    ...extra,
  };
}

const NOW = new Date(2026, 9, 1, 12, 0); // Thu 10/1/2026

const ACTIVITIES = [
  activity("c1", "Tuesday Net", "directed_net", "closed", {
    scheduled_at: "2026-09-22 19:00",
    closed_at: new Date(2026, 8, 22, 20, 0).toISOString(),
  }),
  activity("c2", "Tuesday Net", "directed_net", "closed", {
    scheduled_at: "2026-09-29 19:00",
    closed_at: new Date(2026, 8, 29, 20, 0).toISOString(),
  }),
  activity("u1", "SET Drill", "other", "scheduled", { scheduled_at: "2026-10-10" }),
  activity("u2", "Tuesday Net", "directed_net", "scheduled", { scheduled_at: "2026-10-06 19:00" }),
  activity("u3", "Ad-hoc", "simple_net", "scheduled"),
  activity("o1", "Storm Net", "skywarn", "active", {
    opened_at: new Date(2026, 9, 1, 11, 2).toISOString(),
  }),
  activity("l1", "VHF Simplex", "station_log", "scheduled"),
  activity("l2", "HF Log", "station_log", "closed"),
];

const labels = (rows: { label: string }[]) => rows.map((r) => r.label);

describe("groupActivities", () => {
  it("groups by what's happening: open, station logs, upcoming, closed", () => {
    const groups = groupActivities(ACTIVITIES, "", NOW);
    expect(groups.map(([id]) => id)).toEqual(["open", "logs", "upcoming", "closed"]);
    const [open, logs, upcoming, closed] = groups.map(([, rows]) => rows);
    expect(labels(open)).toEqual(["Storm Net (since 11:02)"]);
    expect(labels(logs)).toEqual(["HF Log (closed)", "VHF Simplex"]);
    // Soonest first, undated last.
    expect(labels(upcoming)).toEqual(["Tue 10/6 19:00 — Tuesday Net", "Sat 10/10 — SET Drill", "Ad-hoc"]);
    // Most recently closed first.
    expect(labels(closed)).toEqual(["Tue 9/29 — Tuesday Net", "Tue 9/22 — Tuesday Net"]);
  });

  it("shows the year for dates outside this year", () => {
    const old = activity("x", "Old Net", "directed_net", "scheduled", { scheduled_at: "2025-12-30" });
    expect(labels(groupActivities([old], "", NOW)[0][1])).toEqual(["Tue 12/30/2025 — Old Net"]);
  });

  it("filters by title, leaving out groups with nothing left", () => {
    const groups = groupActivities(ACTIVITIES, "  tuesday ", NOW);
    expect(groups.map(([id]) => id)).toEqual(["upcoming", "closed"]);
    expect(groupActivities(ACTIVITIES, "zzz", NOW)).toEqual([]);
    expect(groupActivities([], "", NOW)).toEqual([]);
  });
});

describe("OperationsSidebar", () => {
  beforeEach(() => localStorage.clear());

  const show = () =>
    render(
      <OperationsSidebar activities={ACTIVITIES} selectedActivityId={null} onSelectActivity={() => {}} />
    );
  const group = (name: RegExp) => screen.getByText(name).closest("details") as HTMLDetailsElement;

  it("shows each group with a count, Closed folded by default", () => {
    show();
    expect(within(group(/^Open now/)).getByText("(1)")).toBeInTheDocument();
    expect(within(group(/^Closed/)).getByText("(2)")).toBeInTheDocument();
    expect(group(/^Open now/).open).toBe(true);
    expect(group(/^Closed/).open).toBe(false);
  });

  it("remembers which groups are folded", async () => {
    const user = userEvent.setup();
    const { unmount } = show();
    await user.click(screen.getByText(/^Upcoming/));
    await user.click(screen.getByText(/^Closed/));
    await new Promise((r) => setTimeout(r, 0)); // details' toggle event is async
    unmount();
    show();
    expect(group(/^Upcoming/).open).toBe(false);
    expect(group(/^Closed/).open).toBe(true);
  });

  it("filters by title, opening every group that has a match", async () => {
    const user = userEvent.setup();
    show();
    await user.type(screen.getByRole("searchbox", { name: "Filter activities" }), "tuesday");
    expect(screen.queryByText(/^Open now/)).not.toBeInTheDocument();
    expect(group(/^Closed/).open).toBe(true);
    expect(screen.getByText("Tue 9/29 — Tuesday Net")).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText(/No activities match “zzz”/)).toBeInTheDocument();
  });
});
