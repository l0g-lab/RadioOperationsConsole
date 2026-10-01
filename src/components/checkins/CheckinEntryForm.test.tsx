import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QrzLookupResponse } from "../../types";

vi.mock("../../api", () => ({ resolveMileMarker: vi.fn(), createCheckin: vi.fn() }));
vi.mock("../../locationResolution", () => ({
  resolveOfflineLocationAsync: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../../callsignLookup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../callsignLookup")>()),
  lookupCallsign: vi.fn(),
}));

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
