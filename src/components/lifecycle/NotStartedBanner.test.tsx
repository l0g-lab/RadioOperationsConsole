import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Activity } from "../../types";
import NotStartedBanner, { scheduledHint } from "./NotStartedBanner";

describe("scheduledHint", () => {
  const now = new Date(2026, 9, 5, 19, 5);
  it("says how long ago or how soon today, and the day otherwise", () => {
    expect(scheduledHint("2026-10-05 19:00", now)).toBe("scheduled for 19:00, 5 min ago");
    expect(scheduledHint("2026-10-05 17:30", now)).toBe("scheduled for 17:30, 1 h 35 min ago");
    expect(scheduledHint("2026-10-05 19:15", now)).toBe("scheduled for 19:15, in 10 min");
    expect(scheduledHint("2026-10-05 21:00", now)).toBe("scheduled for 21:00");
    expect(scheduledHint("2026-10-06 19:00", now)).toBe("scheduled for Tue 10/6 19:00");
    expect(scheduledHint("2026-10-05", now)).toBe("");
    expect(scheduledHint("", now)).toBe("");
  });
});

describe("NotStartedBanner (LIFE-023)", () => {
  const net = { id: "a1", activity_type: "directed_net", state: "scheduled", scheduled_at: "" } as Activity;

  it("points to Start in the top bar rather than offering its own", () => {
    render(<NotStartedBanner activity={net} />);
    expect(screen.getByRole("status")).toHaveTextContent("This net hasn't started. Use Start net in the top bar");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says relay for a relay, and nothing once started or for a station log", () => {
    const { rerender } = render(<NotStartedBanner activity={{ ...net, activity_type: "relay" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Use Start relay in the top bar");
    rerender(<NotStartedBanner activity={{ ...net, state: "active" }} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    rerender(<NotStartedBanner activity={{ ...net, activity_type: "station_log" }} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
