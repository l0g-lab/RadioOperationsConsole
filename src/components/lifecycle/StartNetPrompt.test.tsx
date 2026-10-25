import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Activity, Checkin } from "../../types";

const api = vi.hoisted(() => ({
  startActivity: vi.fn(async () => {}),
  listCheckins: vi.fn(async (): Promise<Checkin[]> => []),
  listSpotterReports: vi.fn(async () => []),
  getSettings: vi.fn(async () => ({ qrz_username: "", qrz_password: "" })),
  callsignPackStatus: vi.fn(async () => ({ installed: true })),
}));
vi.mock("../../api", () => api);
vi.mock("../../checkinLocation", () => ({ useLocationPlaced: () => {} }));
// The form as one button that saves a check-in; the roster left out.
vi.mock("../checkins/CheckinEntryForm", () => ({
  default: ({ onSaved }: { onSaved: (id: string) => void }) => (
    <button onClick={() => onSaved("c1")}>Save check-in</button>
  ),
}));
vi.mock("../checkins/CheckinRoster", () => ({ default: () => null }));

import CheckinsTab from "../tabs/CheckinsTab";
import { clearNotYet, recordNotYet, shouldAskToStart } from "./StartNetPrompt";

const net: Activity = {
  id: "n1",
  title: "Evening Net",
  activity_type: "directed_net",
  scheduled_at: "",
  frequency: "",
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

function renderTab(activity: Activity, onActivitiesChanged = vi.fn()) {
  render(
    <CheckinsTab
      activities={[activity]}
      operators={[]}
      selectedActivityId={activity.id}
      selectedOperatorId="op1"
      selectedCheckinId={null}
      onSelectCheckin={() => {}}
      focusCallSignSignal={0}
      onOpenExports={() => {}}
      onOpenCallsignDirectories={() => {}}
      onTakeReport={() => {}}
      onActivitiesChanged={onActivitiesChanged}
    />
  );
  return onActivitiesChanged;
}

const prompt = () => screen.queryByRole("alertdialog", { name: "Start the net now?" });
const save = () => userEvent.click(screen.getByRole("button", { name: "Save check-in" }));
const at = (hhmm: string) => new Date(`2026-10-24T${hhmm}:00`).getTime();

describe("when to ask to start the net (LIFE-024)", () => {
  beforeEach(clearNotYet);
  const due = { ...net, scheduled_at: "2026-10-24 19:00" };

  it("asks a net not started until it's answered Not yet; never an open net or a station log", () => {
    expect(shouldAskToStart(net)).toBe(true);
    expect(shouldAskToStart({ ...net, state: "active" })).toBe(false);
    expect(shouldAskToStart({ ...net, activity_type: "station_log" })).toBe(false);
  });

  it("after an early Not yet, asks again once the scheduled time comes", () => {
    recordNotYet(due.id, at("18:45"));
    expect(shouldAskToStart(due, at("18:50"))).toBe(false);
    expect(shouldAskToStart(due, at("18:59"))).toBe(false);
    expect(shouldAskToStart(due, at("19:00"))).toBe(true);
  });

  it("otherwise asks again 10 minutes after Not yet", () => {
    recordNotYet(due.id, at("19:02"));
    expect(shouldAskToStart(due, at("19:11"))).toBe(false);
    expect(shouldAskToStart(due, at("19:12"))).toBe(true);
    recordNotYet(net.id, at("19:02"));
    expect(shouldAskToStart({ ...net, scheduled_at: "2026-10-24" }, at("19:11"))).toBe(false);
  });
});

describe("Start the net now? (LIFE-024)", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    clearNotYet();
    api.listCheckins.mockResolvedValue([]);
  });

  it("blocks after a check-in, with Start now focused, and Enter starts the net", async () => {
    const changed = renderTab(net);
    expect(prompt()).not.toBeInTheDocument();
    await save();
    expect(prompt()).toBeInTheDocument();
    expect(prompt()).toHaveAttribute("aria-modal", "true");
    const startNow = screen.getByRole("button", { name: "Start now" });
    expect(startNow).toHaveFocus();
    // The Enter that saved it, pressed again at once, doesn't start the net.
    await userEvent.keyboard("{Enter}");
    expect(api.startActivity).not.toHaveBeenCalled();
    // Tab stays on its two buttons.
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Not yet: early check-in" })).toHaveFocus();
    await userEvent.tab();
    expect(startNow).toHaveFocus();
    vi.setSystemTime(Date.now() + 600);
    await userEvent.keyboard("{Enter}");
    expect(api.startActivity).toHaveBeenCalledWith("n1", "op1");
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(prompt()).not.toBeInTheDocument();
  });

  it("Not yet (or Escape) leaves it for early check-ins, not asking again at the next", async () => {
    renderTab(net);
    await save();
    await userEvent.keyboard("{Escape}");
    expect(prompt()).not.toBeInTheDocument();
    expect(api.startActivity).not.toHaveBeenCalled();
    expect(screen.getByText(/hasn't started/)).toBeInTheDocument();
    await save();
    expect(prompt()).not.toBeInTheDocument();
  });

  it("doesn't ask once the net is open", async () => {
    renderTab({ ...net, state: "active" });
    await save();
    expect(prompt()).not.toBeInTheDocument();
  });
});
