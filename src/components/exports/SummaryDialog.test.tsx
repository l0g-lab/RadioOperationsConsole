import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, ActivitySummary } from "../../types";

vi.mock("../../api", () => ({
  activitySummary: vi.fn(),
}));
vi.mock("../../export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../export")>()),
  saveTextFile: vi.fn(() => Promise.resolve("/home/pat/Tuesday Net Summary.txt")),
}));

import * as api from "../../api";
import { activitySummaryToText, saveTextFile } from "../../export";
import { SummaryTextDialog } from "./SummaryDialog";
import ActivitySummaryPanel from "../operations/ActivitySummaryPanel";

const NET: Activity = {
  id: "a1",
  title: "Tuesday Net",
  activity_type: "directed_net",
  scheduled_at: "2026-09-29 19:00",
  frequency: "146.940 -0.600 PL 100.0",
  location_label: "",
  location_lat: null,
  location_lon: null,
  state: "closed",
  opened_at: "2026-09-29T23:00:00Z",
  closed_at: "2026-09-29T23:30:00Z",
  conclusion: "Quiet night.",
  repeater_name: "",
  repeater_lat: null,
  repeater_lon: null,
  operator_id: "",
};

const SUMMARY: ActivitySummary = {
  state: "closed",
  opened_at: "2026-09-29T23:00:00Z",
  closed_at: "2026-09-29T23:30:00Z",
  conclusion: "Quiet night.",
  checkins: 12,
  unique_stations: 11,
  removed_checkins: 0,
  first_checkin_at: "",
  last_checkin_at: "",
  spotter_reports: 0,
  hazards: [],
  traffic_items: 1,
  open_traffic_items: 0,
  relay_messages: 0,
  held_relay_messages: 0,
  unpassed_relay_messages: 0,
};

describe("SummaryDialog", () => {
  beforeEach(() => {
    vi.mocked(api.activitySummary).mockResolvedValue(SUMMARY);
    vi.mocked(saveTextFile).mockClear();
  });

  it("warns about traffic left unhandled", async () => {
    const user = userEvent.setup();
    vi.mocked(api.activitySummary).mockResolvedValue({ ...SUMMARY, open_traffic_items: 2 });
    render(<ActivitySummaryPanel activity={NET} />);
    await user.click(await screen.findByRole("button", { name: /Summary/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("2 check-ins have traffic that weren't marked handled.");
  });

  it("saves the same text as the summary export", async () => {
    const user = userEvent.setup();
    render(<SummaryTextDialog activity={NET} onClose={() => {}} />);
    await screen.findByText(/Duration: 30 min/);
    await user.click(screen.getByRole("button", { name: "Save…" }));
    expect(saveTextFile).toHaveBeenCalledWith(
      expect.stringContaining("Summary"),
      activitySummaryToText(NET, SUMMARY)
    );
    expect(await screen.findByText(/Saved to/)).toBeInTheDocument();
  });

  it("uses closing notes still being written", async () => {
    render(<SummaryTextDialog activity={NET} conclusion="  Two new stations.  " onClose={() => {}} />);
    const pre = await screen.findByText(/Two new stations\./);
    expect(pre.textContent).not.toContain("Quiet night.");
  });

  it("shows exactly the text that's saved, before saving it (EXPORT-017)", async () => {
    render(<SummaryTextDialog activity={NET} onClose={() => {}} />);
    expect(await screen.findByRole("dialog", { name: "Summary text — Tuesday Net" })).toBeInTheDocument();
    const pre = await screen.findByText(/Duration: 30 min/);
    expect(pre.tagName).toBe("PRE");
    expect(pre.textContent).toBe(activitySummaryToText(NET, SUMMARY));
  });

  it("is folded to one line on the Operations tab and opens laid out", async () => {
    const user = userEvent.setup();
    render(<ActivitySummaryPanel activity={NET} />);
    // Folded: just the headline counts.
    expect(await screen.findByText(/12 check-ins/)).toBeInTheDocument();
    expect(screen.queryByText("Quiet night.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Summary/ }));
    expect(screen.getByText("Quiet night.")).toBeInTheDocument();
  });
});
