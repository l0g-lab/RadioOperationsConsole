import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Activity } from "../../types";
import ActivitiesPanel from "./ActivitiesPanel";

const base: Activity = {
  id: "",
  title: "",
  activity_type: "directed_net",
  scheduled_at: "",
  frequency: "146.940",
  location_label: "",
  location_lat: null,
  location_lon: null,
  state: "scheduled",
  opened_at: "",
  closed_at: "",
  conclusion: "",
  repeater_name: "",
  repeater_lat: null,
  repeater_lon: null,
  operator_id: "",
  event_id: "",
  event: "",
  record_count: 0,
};

const ACTS: Activity[] = [
  { ...base, id: "open", title: "Storm Net", state: "active", opened_at: new Date().toISOString(), record_count: 14 },
  { ...base, id: "old", title: "Ham net", state: "closed", closed_at: "2026-09-01T20:00:00Z", record_count: 1 },
];

const SET = { event_id: "ev1", event: "ARRL SET" };
const WITH_EVENT: Activity[] = [
  ...ACTS,
  { ...base, ...SET, id: "e1", title: "GMRS net", state: "active", opened_at: new Date().toISOString() },
  { ...base, ...SET, id: "e2", title: "HF relays", activity_type: "relay", scheduled_at: "2099-01-01 10:00" },
];

describe("ActivitiesPanel (UX-OPS-015)", () => {
  it("lists each activity as a button with its count, selecting it on a click", async () => {
    const onSelect = vi.fn();
    render(<ActivitiesPanel activities={ACTS} selectedActivityId={null} onSelectActivity={onSelect} onNewActivity={() => {}} />);
    const row = screen.getByRole("button", { name: /Storm Net/ });
    expect(row).toHaveTextContent("14 check-ins");
    expect(within(row).getByText("2m")).toBeInTheDocument();
    expect(within(row).getByText("Open")).toHaveClass("activity-state-open");
    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith("open");
  });

  it("shows sections in order, an event as its own block with how it's going", () => {
    render(<ActivitiesPanel activities={WITH_EVENT} selectedActivityId={null} onSelectActivity={() => {}} onNewActivity={() => {}} />);
    const headings = [...document.querySelectorAll("summary")].map((s) => s.textContent);
    expect(headings[0]).toBe("Open now (1)");
    // The event's name, with its day and progress under it.
    expect(headings[1]).toMatch(/^ARRL SET.* · 1 open · 1 to go$/);
    expect(headings[2]).toBe("Closed (1)");
    const event = document.querySelector(".activity-section-event") as HTMLElement;
    expect(within(event).getAllByRole("button").map((b) => b.querySelector(".activity-row-title")?.textContent)).toEqual([
      "GMRS net",
      "HF relays",
    ]);
  });

  it("folds Closed, but opens it when it holds the selected activity", () => {
    const { rerender } = render(
      <ActivitiesPanel activities={ACTS} selectedActivityId={null} onSelectActivity={() => {}} onNewActivity={() => {}} />
    );
    const earlier = () => [...document.querySelectorAll("details")].find((d) => d.textContent?.startsWith("Closed"))!;
    expect(earlier().open).toBe(false);
    rerender(<ActivitiesPanel activities={ACTS} selectedActivityId="old" onSelectActivity={() => {}} onNewActivity={() => {}} />);
    expect(earlier().open).toBe(true);
  });

  it("searches everything, showing each result's event", async () => {
    render(<ActivitiesPanel activities={WITH_EVENT} selectedActivityId={null} onSelectActivity={() => {}} onNewActivity={() => {}} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search activities" }), "arrl");
    const results = screen.getByRole("region", { name: "Search results" });
    const found = within(results).getAllByRole("button");
    expect(found).toHaveLength(2);
    for (const b of found) expect(b).toHaveTextContent("· ARRL SET");
  });
});
