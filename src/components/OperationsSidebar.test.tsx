import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Activity } from "../types";
import OperationsSidebar, { groupActivities, LOGS_GROUP, UNSCHEDULED_GROUP } from "./OperationsSidebar";

function activity(id: string, title: string, activity_type: string, scheduled_at = ""): Activity {
  return {
    id,
    title,
    activity_type,
    scheduled_at,
    frequency: "",
    location_label: "",
    location_lat: null,
    location_lon: null,
    state: "scheduled",
    opened_at: "",
    closed_at: "",
    conclusion: "",
  };
}

const ACTIVITIES = [
  activity("n1", "Tuesday Net", "directed_net", "2026-09-22 19:00"),
  activity("l1", "VHF Simplex", "station_log"),
  activity("n2", "Storm Net", "skywarn", "2026-09-29"),
  activity("n3", "Ad-hoc", "other"),
  // A log that was given a date before it became a log still goes with the logs.
  activity("l2", "HF Log", "station_log", "2026-09-01"),
];

describe("groupActivities", () => {
  it("puts station logs first, then nets by date (newest first), then undated ones", () => {
    const groups = groupActivities(ACTIVITIES);
    expect(groups.map(([g]) => g)).toEqual([LOGS_GROUP, "2026-09-29", "2026-09-22", UNSCHEDULED_GROUP]);
    expect(groups[0][1].map((a) => a.title)).toEqual(["HF Log", "VHF Simplex"]);
    expect(groups[3][1].map((a) => a.id)).toEqual(["n3"]);
  });

  it("leaves out groups with nothing in them", () => {
    expect(groupActivities([ACTIVITIES[0]]).map(([g]) => g)).toEqual(["2026-09-22"]);
    expect(groupActivities([])).toEqual([]);
  });
});

describe("OperationsSidebar", () => {
  it("shows logs without a time, and nets with theirs", () => {
    render(<OperationsSidebar activities={ACTIVITIES} selectedActivityId={null} onSelectActivity={() => {}} />);
    expect(screen.getByText("Station logs")).toBeInTheDocument();
    expect(screen.getByText("HF Log")).toBeInTheDocument();
    expect(screen.getByText("19:00 — Tuesday Net")).toBeInTheDocument();
  });
});
