import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Activity } from "../../types";

vi.mock("../../api", () => ({ startActivity: vi.fn() }));

import ActivityStateControls from "./ActivityStateControls";

function activity(activity_type: string, state: string): Activity {
  return {
    id: "a1",
    title: "A",
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
  };
}

const show = (a: Activity) =>
  render(<ActivityStateControls activity={a} operator={null} onChanged={() => {}} />);

describe("ActivityStateControls", () => {
  it("offers Start net for a net that hasn't started", () => {
    show(activity("directed_net", "scheduled"));
    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start net" })).toBeInTheDocument();
  });

  it("shows no start or end for a station log", () => {
    for (const state of ["scheduled", "active"]) {
      const { container, unmount } = show(activity("station_log", state));
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("still lets a closed station log be reopened", () => {
    show(activity("station_log", "closed"));
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reopen…" })).toBeInTheDocument();
  });
});
