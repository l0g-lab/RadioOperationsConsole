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

describe("Start the net now? (LIFE-024)", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    api.listCheckins.mockResolvedValue([]);
  });

  it("asks at the first check-in, with Start now focused, and Enter starts the net", async () => {
    const changed = renderTab(net);
    expect(prompt()).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save check-in" }));
    expect(prompt()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start now" })).toHaveFocus();
    // The Enter that saved it, pressed again at once, doesn't start the net.
    await userEvent.keyboard("{Enter}");
    expect(api.startActivity).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 600);
    await userEvent.keyboard("{Enter}");
    expect(api.startActivity).toHaveBeenCalledWith("n1", "op1");
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(prompt()).not.toBeInTheDocument();
  });

  it("leaves it for early check-ins on Escape, back to the banner", async () => {
    renderTab(net);
    await userEvent.click(screen.getByRole("button", { name: "Save check-in" }));
    await userEvent.keyboard("{Escape}");
    expect(prompt()).not.toBeInTheDocument();
    expect(api.startActivity).not.toHaveBeenCalled();
    expect(screen.getByText(/hasn't started/)).toBeInTheDocument();
  });

  it("doesn't ask after the first check-in", async () => {
    api.listCheckins.mockResolvedValue([{ id: "c0" } as Checkin]);
    renderTab(net);
    await waitFor(() => expect(api.listCheckins).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Save check-in" }));
    expect(prompt()).not.toBeInTheDocument();
  });

  it("doesn't ask once the net is open", async () => {
    renderTab({ ...net, state: "active" });
    await userEvent.click(screen.getByRole("button", { name: "Save check-in" }));
    expect(prompt()).not.toBeInTheDocument();
  });

  it("doesn't ask for a station log", async () => {
    renderTab({ ...net, activity_type: "station_log" });
    await userEvent.click(screen.getByRole("button", { name: "Save check-in" }));
    expect(prompt()).not.toBeInTheDocument();
  });
});
