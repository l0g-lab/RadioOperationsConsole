import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, Checkin } from "../../types";

vi.mock("../../api", () => ({
  listVoidedCheckins: vi.fn(() => Promise.resolve([])),
  updateCheckin: vi.fn(() => Promise.resolve()),
  setCheckinTrafficHandled: vi.fn(() => Promise.resolve()),
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
  repeater_name: "",
  repeater_lat: null,
  repeater_lon: null,
  operator_id: "",
  event_id: "",
  event: "",
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
    location_manual: false,
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
    station_kind: "",
    cross_street: "",
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

  it("lists contacts with frequency, mode, signal reports, power, antenna, and notes", () => {
    renderRoster();
    expect(screen.getByRole("heading", { name: /Contacts — Simplex log/ })).toBeInTheDocument();
    expect(screen.getByText("2 contacts")).toBeInTheDocument();
    for (const header of ["Frequency", "Mode", "RST S / R", "Power", "Antenna", "Notes"]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
    expect(screen.getByText("146.550")).toBeInTheDocument();
    expect(screen.getByText("59 / 57")).toBeInTheDocument();
    expect(screen.getByText("5 W")).toBeInTheDocument();
    expect(screen.getByText("J-pole")).toBeInTheDocument();
    // Long text may be cut off in its column; the full text is on hover.
    expect(screen.getByText("Mobile on I-75")).toHaveAttribute("title", "Mobile on I-75");
    expect(screen.queryByText("Create linked report")).not.toBeInTheDocument();
  });

  it("shows each contact's distance from the log's (or operator's) location", () => {
    const withCoords = [
      { ...CONTACTS[0], location_lat: 28.5383, location_lon: -81.3792 }, // Orlando
      CONTACTS[1], // no location: no distance
    ];
    render(
      <CheckinRoster
        activity={LOG}
        operatorId={null}
        onOpenExports={() => {}}
        checkins={withCoords}
        qrzConfigured={false}
        offlineCallsAvailable={false}
        selectedCheckinId={null}
        onSelectCheckin={() => {}}
        onCheckinsChanged={() => {}}
        onShowMap={() => {}}
        log
        distanceFrom={{ lat: 27.9506, lon: -82.4572, label: "Tampa EOC" }}
      />
    );
    const cell = screen.getByText("77.2 mi");
    expect(cell).toHaveAttribute("title", "124.2 km (77.2 mi) from Tampa EOC");
    expect(screen.getAllByText(/ mi$/)).toHaveLength(1);
    expect(screen.getByText("Distance")).toHaveAttribute(
      "title",
      "Straight-line distance from Tampa EOC"
    );
  });

  it("keeps the rest (address, grid, full notes) under Show details, for contacts that have any", async () => {
    const user = userEvent.setup();
    renderRoster();
    const buttons = screen.getAllByRole("button", { name: "Show details" });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]);
    expect(screen.getAllByText("Mobile on I-75")).toHaveLength(2);
    expect(screen.getByText("Notes:")).toBeInTheDocument();
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
    // Correcting, the time is the contact's own (seconds kept), not a running clock.
    expect(time).toHaveValue(
      `${new Date("2026-09-14T14:05:00Z").toLocaleString("sv-SE").slice(0, 19)}`
    );
    expect(time).toHaveAttribute("placeholder", "YYYY-MM-DD HH:MM:SS");
    await user.clear(time);
    await user.type(time, "2026-09-15T08:30");
    await user.click(within(mode.closest(".checkin-row")! as HTMLElement).getByRole("button", { name: "Save" }));

    const args = vi.mocked(api.updateCheckin).mock.calls[0];
    expect(args[1]).toBe("KD4ABC");
    expect(args[12]).toMatchObject({ mode: "SSB", notes: null, frequency: "146.550", rst_sent: "59" });
    expect(new Date(args[12]!.contacted_at!).getTime()).toBe(new Date(2026, 8, 15, 8, 30).getTime());
  });
});

describe("CheckinRoster as a range check", () => {
  const RANGE: Activity = {
    ...LOG,
    id: "rc1",
    title: "Range check",
    activity_type: "range_check",
    location_label: "Repeater site",
    location_lat: 28.5,
    location_lon: -81.4,
  };
  const REPORT = contact({
    frequency: "",
    mode: "",
    station_kind: "base",
    cross_street: "Colonial & Mills",
    location_lat: 28.55,
    location_lon: -81.35,
    antenna: "Diamond X50",
    power: "50 W",
    rst_sent: "Full quieting",
    rst_received: "Broken",
    notes: "",
  });

  function renderRange(selectedCheckinId: string | null = null) {
    return render(
      <CheckinRoster
        activity={RANGE}
        operatorId={null}
        onOpenExports={() => {}}
        checkins={[REPORT]}
        qrzConfigured={false}
        offlineCallsAvailable={false}
        selectedCheckinId={selectedCheckinId}
        onSelectCheckin={() => {}}
        onCheckinsChanged={() => {}}
        onShowMap={() => {}}
        rangeCheck
        distanceFrom={{ lat: 28.5, lon: -81.4, label: "Repeater site" }}
      />
    );
  }

  beforeEach(() => vi.mocked(api.updateCheckin).mockClear());

  it("shows cross street, distance, station, antenna, power and both reports (RANGE-020)", () => {
    renderRange();
    for (const header of ["Cross Street", "Distance", "Station", "Antenna", "Power", "We Hear Them", "They Hear Rptr"]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
    expect(screen.getByText("Colonial & Mills")).toBeInTheDocument();
    expect(screen.getByText("Base")).toBeInTheDocument();
    expect(screen.getByText("Full quieting")).toBeInTheDocument();
    expect(screen.getByText("Broken")).toBeInTheDocument();
    expect(screen.getByText(/\d+(\.\d)? mi/)).toBeInTheDocument();
  });

  it("refuses a correction that leaves out a required field (RANGE-017)", async () => {
    const user = userEvent.setup();
    renderRange("c1");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Cross street")).toHaveValue("Colonial & Mills");
    await user.clear(screen.getByLabelText("Antenna"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(api.updateCheckin).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Still needed: antenna.");

    // Switching to a mobile drops the antenna requirement, and the antenna.
    await user.click(screen.getByRole("radio", { name: "Mobile" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    const args = vi.mocked(api.updateCheckin).mock.calls[0];
    expect(args.slice(7, 10)).toEqual([28.55, -81.35, "Colonial & Mills"]);
    expect(args[12]).toMatchObject({ station_kind: "mobile", antenna: null, rst_sent: "Full quieting" });
  });
});

describe("CheckinRoster as a net", () => {
  const NET: Activity = { ...LOG, id: "net1", title: "Tuesday Net", activity_type: "directed_net" };
  const WITH_TRAFFIC = contact({
    id: "t1",
    call_sign: "W2TRF",
    has_traffic: true,
    traffic: "Need a generator",
    frequency: "",
    mode: "",
    rst_sent: "",
    rst_received: "",
    power: "",
    antenna: "",
    notes: "",
  });

  function renderNet(selectedCheckinId: string | null = null) {
    return render(
      <CheckinRoster
        activity={NET}
        operatorId="op1"
        onOpenExports={() => {}}
        checkins={[WITH_TRAFFIC]}
        qrzConfigured={false}
        offlineCallsAvailable={false}
        selectedCheckinId={selectedCheckinId}
        onSelectCheckin={() => {}}
        onCheckinsChanged={() => {}}
        onShowMap={() => {}}
      />
    );
  }

  beforeEach(() => {
    vi.mocked(api.updateCheckin).mockClear();
    vi.mocked(api.setCheckinTrafficHandled).mockClear();
  });

  it("shows traffic on request and marks it handled", async () => {
    const user = userEvent.setup();
    renderNet();
    expect(screen.getByRole("heading", { name: /Check-ins — Tuesday Net/ })).toBeInTheDocument();
    expect(screen.getByText("Grid Square")).toBeInTheDocument();
    expect(screen.queryByText("Need a generator")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show traffic" }));
    expect(screen.getByText("Need a generator")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Handled" }));
    expect(api.setCheckinTrafficHandled).toHaveBeenCalledWith("t1", true, "op1");
  });

  it("corrects a check-in's traffic", async () => {
    const user = userEvent.setup();
    renderNet("t1");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const traffic = screen.getByPlaceholderText("Traffic (blank if none)");
    expect(traffic).toHaveValue("Need a generator");
    await user.clear(traffic);
    await user.type(traffic, "Need water{Enter}");

    const args = vi.mocked(api.updateCheckin).mock.calls[0];
    expect(args.slice(0, 2)).toEqual(["t1", "W2TRF"]);
    expect(args.slice(10, 13)).toEqual([true, "Need water", null]);
  });

  it("clearing the traffic means the station has none", async () => {
    const user = userEvent.setup();
    renderNet("t1");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const traffic = screen.getByPlaceholderText("Traffic (blank if none)");
    await user.clear(traffic);
    await user.type(traffic, "{Enter}");
    expect(vi.mocked(api.updateCheckin).mock.calls[0].slice(10, 12)).toEqual([false, null]);
  });
});
