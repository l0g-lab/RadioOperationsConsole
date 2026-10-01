import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, Checkin } from "../../types";

vi.mock("../../api", () => ({
  listVoidedCheckins: vi.fn(() => Promise.resolve([])),
  updateCheckin: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../locationResolution", () => ({
  resolveOfflineLocationAsync: vi.fn(() => Promise.resolve(null)),
}));

import * as api from "../../api";
import CheckinRoster from "./CheckinRoster";

const LOG: Activity = {
  id: "log1",
  title: "Simplex log",
  activity_type: "station_log",
  scheduled_at: "",
  frequency: "146.520",
  location_label: "",
  location_lat: null,
  location_lon: null,
  state: "scheduled",
  opened_at: "",
  closed_at: "",
  conclusion: "",
};

function contact(overrides: Partial<Checkin>): Checkin {
  return {
    id: "c1",
    call_sign: "KD4ABC",
    name: "Pat",
    qth_location: "Orlando",
    grid_square: "",
    address: "",
    checked_in_at: "2026-09-14T14:05:00Z",
    location_lat: null,
    location_lon: null,
    location_label: "",
    has_traffic: false,
    traffic: "",
    traffic_handled: false,
    frequency: "146.550",
    mode: "FM",
    rst_sent: "59",
    rst_received: "57",
    power: "5 W",
    antenna: "J-pole",
    notes: "Mobile on I-75",
    ...overrides,
  };
}

const CONTACTS = [
  contact({}),
  contact({
    id: "c2",
    call_sign: "W1AW",
    name: "Hiram",
    qth_location: "Newington",
    frequency: "",
    mode: "",
    rst_sent: "",
    rst_received: "",
    power: "",
    antenna: "",
    notes: "",
  }),
];

function renderRoster(selectedCheckinId: string | null = null) {
  return render(
    <CheckinRoster
      activity={LOG}
      operatorId={null}
      onOpenExports={() => {}}
      checkins={CONTACTS}
      qrzConfigured={false}
      offlineCallsAvailable={false}
      selectedCheckinId={selectedCheckinId}
      onSelectCheckin={() => {}}
      onCheckinsChanged={() => {}}
      onShowMap={() => {}}
      log
    />
  );
}

describe("CheckinRoster as a station log", () => {
  beforeEach(() => vi.mocked(api.updateCheckin).mockClear());

  it("lists contacts with frequency, mode, and signal reports", () => {
    renderRoster();
    expect(screen.getByRole("heading", { name: /Contacts — Simplex log/ })).toBeInTheDocument();
    expect(screen.getByText("2 contacts")).toBeInTheDocument();
    expect(screen.getByText("146.550")).toBeInTheDocument();
    expect(screen.getByText("59 / 57")).toBeInTheDocument();
    expect(screen.queryByText("Create linked report")).not.toBeInTheDocument();
  });

  it("shows power, antenna, and notes on request, only for contacts that have details", async () => {
    const user = userEvent.setup();
    renderRoster();
    const buttons = screen.getAllByRole("button", { name: "Show details" });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]);
    expect(screen.getByText("J-pole")).toBeInTheDocument();
    expect(screen.getByText("Mobile on I-75")).toBeInTheDocument();
  });

  it("searches by call sign, name, location, or notes", async () => {
    const user = userEvent.setup();
    renderRoster();
    const search = screen.getByRole("searchbox", { name: "Search contacts" });
    await user.type(search, "newington");
    expect(screen.getByText("W1AW")).toBeInTheDocument();
    expect(screen.queryByText("KD4ABC")).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "i-75");
    expect(screen.getByText("KD4ABC")).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText(/No contacts match “zzz”/)).toBeInTheDocument();
  });

  it("corrects a contact's details, including its time", async () => {
    const user = userEvent.setup();
    renderRoster("c1");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const mode = screen.getByLabelText("Mode");
    expect(mode).toHaveValue("FM");
    await user.clear(mode);
    await user.type(mode, "SSB");
    await user.clear(screen.getByLabelText("Notes"));
    const time = screen.getByLabelText("Contact time");
    await user.clear(time);
    await user.type(time, "2026-09-15T08:30");
    await user.click(within(mode.closest(".checkin-row")! as HTMLElement).getByRole("button", { name: "Save" }));

    const args = vi.mocked(api.updateCheckin).mock.calls[0];
    expect(args[1]).toBe("KD4ABC");
    expect(args[12]).toMatchObject({ mode: "SSB", notes: null, frequency: "146.550", rst_sent: "59" });
    expect(new Date(args[12]!.contacted_at!).getTime()).toBe(new Date(2026, 8, 15, 8, 30).getTime());
  });
});
