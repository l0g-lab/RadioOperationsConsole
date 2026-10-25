import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Activity, Tab } from "../types";
import NavRail, { RAIL_DEFAULT, RAIL_MAX, railActivities } from "./NavRail";

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
  { ...base, id: "a", title: "Storm Net", state: "active", opened_at: "2026-10-24T18:00:00Z", record_count: 14 },
  { ...base, id: "b", title: "GMRS net", state: "active", opened_at: "2026-10-24T19:00:00Z" },
  { ...base, id: "old", title: "Ham net", state: "closed", closed_at: "2026-09-01T20:00:00Z" },
  { ...base, id: "later", title: "Sunday net", scheduled_at: "2099-01-01 10:00" },
  { ...base, id: "log", title: "Station log", activity_type: "station_log", state: "active" },
];

function renderRail(current: Tab, selected: string | null, listOpen = false) {
  const onSelect = vi.fn();
  const onSelectActivity = vi.fn();
  const onOpenActivityList = vi.fn();
  const onNewActivity = vi.fn();
  render(
    <NavRail
      current={current}
      onSelect={onSelect}
      activities={ACTS}
      selectedActivityId={selected}
      onSelectActivity={onSelectActivity}
      activityListOpen={listOpen}
      onOpenActivityList={onOpenActivityList}
      onNewActivity={onNewActivity}
    />
  );
  return { onSelect, onSelectActivity, onOpenActivityList, onNewActivity };
}

describe("NavRail (UX-030)", () => {
  it("lists the nets open now, latest first, then the focused one if it isn't open", () => {
    expect(railActivities(ACTS, null).map((a) => a.id)).toEqual(["b", "a"]);
    expect(railActivities(ACTS, "old").map((a) => a.id)).toEqual(["b", "a", "old"]);
    expect(railActivities(ACTS, "a").map((a) => a.id)).toEqual(["b", "a"]);
  });

  it("shows every tab, marking the current one", () => {
    renderRail("Weather", null);
    expect(screen.getByRole("button", { name: "Weather" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Settings" })).not.toHaveAttribute("aria-current");
  });

  it("shows each open net's state and count", () => {
    renderRail("Operations", "a");
    const list = screen.getByRole("list", { name: "Open activities" });
    const row = within(list).getByRole("button", { name: /Storm Net/ });
    expect(row).toHaveTextContent("Open · 14 check-ins");
    expect(row).toHaveAttribute("aria-current", "true");
  });

  it("chooses an activity in place on an activity tab", async () => {
    const onCheckins = renderRail("Check-ins", "a");
    await userEvent.click(screen.getByRole("button", { name: /GMRS net/ }));
    expect(onCheckins.onSelectActivity).toHaveBeenCalledWith("b");
    expect(onCheckins.onSelect).not.toHaveBeenCalled();
  });

  it("goes to Operations when an activity is chosen from Weather", async () => {
    const { onSelect, onSelectActivity } = renderRail("Weather", "a");
    await userEvent.click(screen.getByRole("button", { name: /GMRS net/ }));
    expect(onSelectActivity).toHaveBeenCalledWith("b");
    expect(onSelect).toHaveBeenCalledWith("Operations");
  });

  it("opens the full list, marked in place of Operations while it shows", async () => {
    const { onOpenActivityList } = renderRail("Operations", "a", true);
    expect(screen.getByRole("button", { name: "Operations" })).not.toHaveAttribute("aria-current");
    const all = screen.getByRole("button", { name: "All activities" });
    expect(all).toHaveAttribute("aria-current", "page");
    await userEvent.click(all);
    expect(onOpenActivityList).toHaveBeenCalled();
  });

  it("resizes from its edge with the keys, remembers it, and double-click resets it (UX-033)", async () => {
    localStorage.removeItem("roc-nav-rail-width");
    renderRail("Weather", null);
    const edge = screen.getByRole("separator", { name: "Side bar width" });
    expect(edge).toHaveAttribute("aria-valuenow", String(RAIL_DEFAULT));
    edge.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(edge).toHaveAttribute("aria-valuenow", String(RAIL_DEFAULT + 20));
    expect(localStorage.getItem("roc-nav-rail-width")).toBe(String(RAIL_DEFAULT + 20));
    await userEvent.keyboard("{End}");
    expect(edge).toHaveAttribute("aria-valuenow", String(RAIL_MAX));
    await userEvent.dblClick(edge);
    expect(edge).toHaveAttribute("aria-valuenow", String(RAIL_DEFAULT));
  });

  it("starts a new activity from beside All activities", async () => {
    const { onNewActivity, onOpenActivityList } = renderRail("Weather", null);
    await userEvent.click(screen.getByRole("button", { name: "New activity" }));
    expect(onNewActivity).toHaveBeenCalled();
    expect(onOpenActivityList).not.toHaveBeenCalled();
  });

  it("collapses to its icons, each named on hovering, and remembers it (UX-035)", async () => {
    localStorage.removeItem("roc-nav-rail-collapsed");
    renderRail("Operations", "a");
    expect(screen.getByRole("list", { name: "Open activities" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Collapse side bar" }));
    expect(localStorage.getItem("roc-nav-rail-collapsed")).toBe("1");
    expect(screen.getByRole("button", { name: "Weather" })).toHaveAttribute("title", "Weather");
    expect(screen.queryByRole("list", { name: "Open activities" })).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "Side bar width" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Expand side bar" }));
    expect(localStorage.getItem("roc-nav-rail-collapsed")).toBe("0");
    expect(screen.getByRole("list", { name: "Open activities" })).toBeInTheDocument();
  });
});
