import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QrzLookupResponse } from "../../types";

vi.mock("../../api", () => ({
  resolveMileMarker: vi.fn(),
  createCheckin: vi.fn(),
  stationHistory: vi.fn(() => Promise.resolve({ count: 0, last: null })),
}));
vi.mock("../../locationResolution", () => ({
  resolveOfflineLocationAsync: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../../callsignLookup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../callsignLookup")>()),
  lookupCallsign: vi.fn(),
}));

import * as api from "../../api";
import { lookupCallsign } from "../../callsignLookup";
import CheckinEntryForm from "./CheckinEntryForm";

const NAMES: Record<string, string> = { KR4H: "Wrong Person", KR4HGY: "Right Person" };

function hit(call: string): QrzLookupResponse {
  return {
    call_sign: call,
    name: NAMES[call] ?? null,
    qth_location: `${call} town`,
    grid_square: null,
    address: null,
    exact_lat: null,
    exact_lon: null,
    geoloc: null,
  };
}

function renderForm() {
  return render(
    <CheckinEntryForm
      activityId="a1"
      operatorId={null}
      qrzConfigured={true}
      offlineCallsAvailable={false}
      rapidEntryMode={false}
      focusCallSignSignal={0}
      onSaved={() => {}}
    />
  );
}

// Real time: Testing Library itself waits on timers, so faking them stalls it.
const pause = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

describe("CheckinEntryForm type-as-you-go lookup (QRZ-037)", { timeout: 10_000 }, () => {
  beforeEach(() => {
    vi.mocked(lookupCallsign).mockReset();
    vi.mocked(lookupCallsign).mockImplementation(async (call) => ({
      kind: "found",
      source: "qrz",
      data: hit(call),
    }));
  });

  it("does not look up a call sign mid-typing after a short pause", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Call sign"), "KR4H");
    await pause(500);
    await user.type(screen.getByLabelText("Call sign"), "GY");
    await pause(1000);
    expect(vi.mocked(lookupCallsign).mock.calls.map((c) => c[0])).toEqual(["KR4HGY"]);
  });

  it("replaces what was filled for a shorter call sign once the full one is typed", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Call sign"), "KR4H");
    await pause(1000);
    expect(screen.getByLabelText(/^Name/)).toHaveValue("Wrong Person");

    await user.type(screen.getByLabelText("Call sign"), "GY");
    await pause(1000);
    expect(lookupCallsign).toHaveBeenLastCalledWith("KR4HGY", true);
    expect(screen.getByLabelText(/^Name/)).toHaveValue("Right Person");
  });

  it("keeps a name the operator typed when the call sign changes", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Call sign"), "KR4H");
    await pause(1000);
    const name = screen.getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Pat");

    await user.type(screen.getByLabelText("Call sign"), "GY");
    await pause(1000);
    expect(name).toHaveValue("Pat");
  });

  it("keeps a QTH the operator typed before the lookup filled the name", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByPlaceholderText(/^QTH location/), "Field Day site");
    await user.type(screen.getByLabelText("Call sign"), "KR4H");
    await pause(1000);
    expect(screen.getByLabelText(/^Name/)).toHaveValue("Wrong Person");

    await user.type(screen.getByLabelText("Call sign"), "GY");
    await pause(1000);
    expect(screen.getByLabelText(/^Name/)).toHaveValue("Right Person");
    expect(screen.getByPlaceholderText(/^QTH location/)).toHaveValue("Field Day site");
  });
});

describe("CheckinEntryForm in a station log", { timeout: 10_000 }, () => {
  beforeEach(() => {
    vi.mocked(lookupCallsign).mockResolvedValue({ kind: "unavailable", error: "offline" });
    vi.mocked(api.createCheckin).mockReset();
    vi.mocked(api.createCheckin).mockResolvedValue("c1");
    vi.mocked(api.stationHistory).mockResolvedValue({ count: 0, last: null });
  });

  function renderLog() {
    return render(
      <CheckinEntryForm
        activityId="log1"
        operatorId={null}
        qrzConfigured={false}
        offlineCallsAvailable={false}
        rapidEntryMode={false}
        focusCallSignSignal={0}
        onSaved={() => {}}
        log
        activityFrequency="146.520"
      />
    );
  }

  it("saves a contact with its radio details, keeping the station setup for the next one", async () => {
    const user = userEvent.setup();
    renderLog();
    expect(screen.queryByText("Has traffic")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Frequency")).toHaveAttribute("placeholder", "Frequency (146.520)");

    await user.type(screen.getByLabelText("Call sign"), "KD4ABC");
    await user.type(screen.getByLabelText("Frequency"), "146.550");
    await user.type(screen.getByLabelText("Mode"), "FM");
    await user.type(screen.getByLabelText("RST sent"), "59");
    await user.type(screen.getByLabelText("RST received"), "57");
    await user.type(screen.getByLabelText("Power"), "5 W");
    await user.type(screen.getByLabelText("Antenna"), "J-pole");
    await user.type(screen.getByLabelText("Notes"), "Mobile");
    await user.click(screen.getByRole("button", { name: "Save contact" }));

    const args = vi.mocked(api.createCheckin).mock.calls[0];
    expect(args[1]).toBe("KD4ABC");
    expect(args[12]).toEqual({
      contacted_at: null,
      frequency: "146.550",
      mode: "FM",
      rst_sent: "59",
      rst_received: "57",
      power: "5 W",
      antenna: "J-pole",
      notes: "Mobile",
    });
    expect(screen.getByLabelText("Frequency")).toHaveValue("146.550");
    expect(screen.getByLabelText("Mode")).toHaveValue("FM");
    expect(screen.getByLabelText("Antenna")).toHaveValue("J-pole");
    expect(screen.getByLabelText("RST sent")).toHaveValue("");
    expect(screen.getByLabelText("Notes")).toHaveValue("");
  });

  it("needs nothing but a call sign, and takes a contact time when given", async () => {
    const user = userEvent.setup();
    renderLog();
    await user.type(screen.getByLabelText("Call sign"), "W1AW");
    await user.click(screen.getByRole("button", { name: "Save contact" }));
    expect(vi.mocked(api.createCheckin).mock.calls[0][12]).toMatchObject({
      contacted_at: null,
      frequency: null,
      notes: null,
    });

    await user.type(screen.getByLabelText("Call sign"), "K4XYZ");
    await user.type(screen.getByLabelText("Contact time"), "2026-09-14T10:05");
    await user.click(screen.getByRole("button", { name: "Save contact" }));
    const at = vi.mocked(api.createCheckin).mock.calls[1][12]?.contacted_at;
    expect(new Date(at!).getTime()).toBe(new Date(2026, 8, 14, 10, 5).getTime());
  });

  it("refuses an unreadable time, saying why, and keeps what was typed", async () => {
    const user = userEvent.setup();
    renderLog();
    await user.type(screen.getByLabelText("Call sign"), "W1AW");
    const time = screen.getByLabelText("Contact time");
    await user.type(time, "10:");
    // Still typing: no complaint yet.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.type(time, "{Enter}");
    expect(api.createCheckin).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/"10:" isn't a time/);
    expect(screen.getByLabelText("Call sign")).toHaveValue("W1AW");

    await user.type(time, "05");
    await user.click(screen.getByRole("button", { name: "Save contact" }));
    expect(api.createCheckin).toHaveBeenCalledTimes(1);
  });

  it("says when and where a call sign was worked before", async () => {
    vi.mocked(api.stationHistory).mockResolvedValue({
      count: 3,
      last: {
        activity_id: "log1",
        activity_title: "Simplex log",
        at: "2026-09-14T14:05:00Z",
        name: "Pat",
        qth_location: "Orlando",
        frequency: "146.520",
      },
    });
    const user = userEvent.setup();
    renderLog();
    await user.type(screen.getByLabelText("Call sign"), "KD4ABC");
    const line = await screen.findByRole("status");
    expect(api.stationHistory).toHaveBeenCalledWith("KD4ABC");
    expect(line).toHaveTextContent(/Worked before: 3 times/);
    expect(line).toHaveTextContent(/“Simplex log” on 146\.520 · Pat, Orlando/);
  });
});
