import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api", () => ({
  resolveMileMarker: vi.fn(),
  createCheckin: vi.fn(),
  stationHistory: vi.fn(() => Promise.resolve({ count: 0, last: null })),
}));
vi.mock("../../locationResolution", () => ({
  resolveOfflineLocationAsync: vi.fn(() => Promise.resolve(null)),
}));
// The real picker is a Leaflet map; this stands in for a click on it, and
// records how it was opened.
const pickerProps = vi.fn();
vi.mock("../LocationPicker", () => ({
  default: (props: { onSave: (lat: number, lon: number, label: string) => void }) => {
    pickerProps(props);
    return <button onClick={() => props.onSave(28.55, -81.35, "")}>Click the map</button>;
  },
}));

import * as api from "../../api";
import CheckinEntryForm from "./CheckinEntryForm";

function renderRangeCheck() {
  return render(
    <CheckinEntryForm
      activityId="rc1"
      operatorId={null}
      qrzConfigured={false}
      offlineCallsAvailable={false}
      rapidEntryMode={false}
      focusCallSignSignal={0}
      onSaved={() => {}}
      rangeCheck
      repeater={{ lat: 28.5, lon: -81.4 }}
    />
  );
}

describe("CheckinEntryForm in a range check", () => {
  beforeEach(() => {
    vi.mocked(api.createCheckin).mockReset();
    vi.mocked(api.createCheckin).mockResolvedValue("c1");
    pickerProps.mockClear();
  });

  it("offers no address, coordinates or traffic entry (RANGE-014, RANGE-015)", () => {
    renderRangeCheck();
    expect(screen.queryByPlaceholderText(/Coordinates/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Full address/)).not.toBeInTheDocument();
    expect(screen.queryByText("Has traffic")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cross street")).toBeInTheDocument();
  });

  it("refuses an incomplete check-in, naming what's missing and keeping what was typed (RANGE-011)", async () => {
    const user = userEvent.setup();
    renderRangeCheck();
    await user.type(screen.getByLabelText("Call sign"), "KD4ABC");
    await user.type(screen.getByLabelText("Cross street"), "Colonial & Mills");
    await user.click(screen.getByRole("button", { name: "Save check-in" }));

    expect(api.createCheckin).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Still needed: point on the map, station type, power, how we hear them, how they hear the repeater."
    );
    expect(screen.getByLabelText("Power")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Cross street")).toHaveValue("Colonial & Mills");
    expect(screen.getByLabelText("Call sign")).toHaveValue("KD4ABC");
  });

  it("asks for an antenna only from a base station (RANGE-012)", async () => {
    const user = userEvent.setup();
    renderRangeCheck();
    expect(screen.queryByLabelText("Antenna")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Base" }));
    expect(screen.getByLabelText("Antenna")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "HT" }));
    expect(screen.queryByLabelText("Antenna")).not.toBeInTheDocument();
  });

  it("offers only the five signal reports (RANGE-013)", () => {
    renderRangeCheck();
    const options = Array.from(
      (screen.getByLabelText("How we hear them") as HTMLSelectElement).options
    ).map((o) => o.value);
    expect(options).toEqual([
      "",
      "Full quieting",
      "Slight noise",
      "Noisy but readable",
      "Broken",
      "Unreadable",
    ]);
  });

  it("saves a complete check-in with its map point and starts the next one blank (RANGE-010, RANGE-016)", async () => {
    const user = userEvent.setup();
    renderRangeCheck();
    await user.type(screen.getByLabelText("Call sign"), "KD4ABC");
    await user.type(screen.getByLabelText("Cross street"), "Colonial & Mills");
    await user.click(screen.getByRole("button", { name: "Pick on map" }));
    // The map is map-only and opens on the repeater (RANGE-014).
    expect(pickerProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ mapOnly: true, startAt: { lat: 28.5, lon: -81.4 } })
    );
    await user.click(screen.getByRole("button", { name: "Click the map" }));
    await user.click(screen.getByRole("radio", { name: "Base" }));
    await user.type(screen.getByLabelText("Antenna"), "Diamond X50");
    await user.type(screen.getByLabelText("Power"), "50 W");
    await user.selectOptions(screen.getByLabelText("How we hear them"), "Full quieting");
    await user.selectOptions(screen.getByLabelText("How they hear the repeater"), "Broken");
    await user.click(screen.getByRole("button", { name: "Save check-in" }));

    const args = vi.mocked(api.createCheckin).mock.calls[0];
    expect(args.slice(0, 11)).toEqual([
      "rc1",
      "KD4ABC",
      null,
      null,
      null,
      null,
      null,
      28.55,
      -81.35,
      "Colonial & Mills",
      false,
    ]);
    expect(args[12]).toEqual({
      station_kind: "base",
      cross_street: "Colonial & Mills",
      antenna: "Diamond X50",
      power: "50 W",
      rst_sent: "Full quieting",
      rst_received: "Broken",
      notes: null,
    });
    expect(screen.getByLabelText("Cross street")).toHaveValue("");
    expect(screen.getByLabelText("Power")).toHaveValue("");
    expect(screen.getByLabelText("How we hear them")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Pick on map" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { checked: true })).not.toBeInTheDocument();
  });

  it("shows the backend's refusal", async () => {
    vi.mocked(api.createCheckin).mockRejectedValue("Set the repeater's location first.");
    const user = userEvent.setup();
    renderRangeCheck();
    await user.type(screen.getByLabelText("Call sign"), "KD4ABC");
    await user.type(screen.getByLabelText("Cross street"), "Colonial & Mills");
    await user.click(screen.getByRole("button", { name: "Pick on map" }));
    await user.click(screen.getByRole("button", { name: "Click the map" }));
    await user.click(screen.getByRole("radio", { name: "Mobile" }));
    await user.type(screen.getByLabelText("Power"), "50 W");
    await user.selectOptions(screen.getByLabelText("How we hear them"), "Broken");
    await user.selectOptions(screen.getByLabelText("How they hear the repeater"), "Broken");
    await user.click(screen.getByRole("button", { name: "Save check-in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Set the repeater's location first.");
    expect(screen.getByLabelText("Cross street")).toHaveValue("Colonial & Mills");
  });
});
