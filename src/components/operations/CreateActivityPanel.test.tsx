import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Operator, Repeater } from "../../types";

vi.mock("../../api", () => ({
  createActivity: vi.fn(() => Promise.resolve("new")),
  setActivityLocationCoords: vi.fn(() => Promise.resolve()),
  setActivityRepeater: vi.fn(() => Promise.resolve()),
}));

// The real picker is a Leaflet map; this stands in for choosing a point.
vi.mock("../LocationPicker", () => ({
  default: (props: { onSave: (lat: number, lon: number, label: string) => void }) => (
    <button onClick={() => props.onSave(28.5, -81.4, "Repeater site")}>Choose point</button>
  ),
}));

import * as api from "../../api";
import CreateActivityPanel from "./CreateActivityPanel";

const W4ABC: Repeater = {
  id: "r1",
  name: "W4ABC Orlando",
  output_mhz: 146.94,
  offset_mhz: -0.6,
  tone_in_kind: "pl",
  tone_in: "100.0",
  tone_out_kind: "pl",
  tone_out: "100.0",
  mode: "FM",
  location_label: "",
  location_lat: 28.54,
  location_lon: -81.38,
  notes: "",
  retired_at: "",
};

function renderPanel(
  operators: Operator[] = [],
  selectedOperatorId: string | null = null,
  repeaters: Repeater[] = []
) {
  return render(
    <CreateActivityPanel
      activities={[]}
      onActivitiesChanged={() => {}}
      onSelectActivity={() => {}}
      operators={operators}
      selectedOperatorId={selectedOperatorId}
      repeaters={repeaters}
    />
  );
}

describe("CreateActivityPanel", () => {
  beforeEach(() => {
    vi.mocked(api.createActivity).mockClear();
    vi.mocked(api.setActivityLocationCoords).mockClear();
    vi.mocked(api.setActivityRepeater).mockClear();
  });

  it("asks a net for its date, but not a station log, which is saved undated", async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(screen.getByText(/Date \(YYYY-MM-DD\)/)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: /type/i }), "station_log");
    expect(screen.queryByText(/Date \(YYYY-MM-DD\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Time \(HH:MM/)).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Activity title"), "VHF Simplex{Enter}");
    expect(api.createActivity).toHaveBeenCalledWith("VHF Simplex", "station_log", null, null, null);
  });

  it("won't create a range check without a repeater, and keeps net control at the operator (RANGE-002, RPT-021)", async () => {
    const user = userEvent.setup();
    const operator: Operator = {
      id: "op1",
      display_name: "Pat",
      call_sign: "K4NCS",
      location_label: "Pat's QTH",
      location_lat: 28.0,
      location_lon: -81.0,
    };
    renderPanel([operator], "op1");
    await user.selectOptions(screen.getByRole("combobox", { name: /type/i }), "range_check");
    await user.type(screen.getByPlaceholderText("Activity title"), "Range check{Enter}");
    expect(api.createActivity).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create activity" })).toBeDisabled();
    expect(screen.getByText(/a range check needs its repeater/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Place repeater on map" }));
    await user.click(screen.getByRole("button", { name: "Choose point" }));
    await user.click(screen.getByRole("button", { name: "Create activity" }));
    expect(api.createActivity).toHaveBeenCalledWith("Range check", "range_check", expect.any(String), null, "op1");
    expect(api.setActivityRepeater).toHaveBeenCalledWith("new", "Repeater site", 28.5, -81.4);
    expect(api.setActivityLocationCoords).toHaveBeenCalledWith("new", 28.0, -81.0, "Pat's QTH");
  });

  it("fills the frequency and repeater from the directory (RPT-020, RPT-021)", async () => {
    const user = userEvent.setup();
    renderPanel([], null, [W4ABC]);
    await user.type(screen.getByPlaceholderText("Activity title"), "Tuesday Net");
    await user.selectOptions(screen.getByRole("combobox", { name: "Pick a repeater" }), "r1");
    expect(screen.getByPlaceholderText("e.g. 146.940 -0.6 PL 100.0")).toHaveValue(
      "146.940 -0.600 PL 100.0"
    );
    await user.click(screen.getByRole("button", { name: "Create activity" }));
    expect(api.createActivity).toHaveBeenCalledWith(
      "Tuesday Net",
      "directed_net",
      expect.any(String),
      "146.940 -0.600 PL 100.0",
      null
    );
    expect(api.setActivityRepeater).toHaveBeenCalledWith("new", "W4ABC Orlando", 28.54, -81.38);
    expect(api.setActivityLocationCoords).not.toHaveBeenCalled();
  });

  it("fills the form from a net listing without creating anything (NETL-030, NETL-031)", async () => {
    const user = userEvent.setup();
    render(
      <CreateActivityPanel
        activities={[]}
        onActivitiesChanged={() => {}}
        onSelectActivity={() => {}}
        operators={[]}
        selectedOperatorId={null}
        repeaters={[W4ABC]}
        prefill={{
          title: "Tuesday Night Net",
          activityType: "directed_net",
          date: "2026-10-06",
          time: "19:00",
          frequency: "146.940 -0.600 PL 100.0",
          repeater: { name: "W4ABC Orlando", lat: 28.54, lon: -81.38 },
        }}
        onPrefillHandled={() => {}}
      />
    );
    expect(screen.getByPlaceholderText("Activity title")).toHaveValue("Tuesday Night Net");
    expect(screen.getByDisplayValue("2026-10-06")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. 19:00")).toHaveValue("19:00");
    expect(screen.getByText(/W4ABC Orlando —/, { selector: "strong" })).toBeInTheDocument();
    expect(api.createActivity).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Create activity" }));
    expect(api.createActivity).toHaveBeenCalledWith(
      "Tuesday Night Net",
      "directed_net",
      "2026-10-06 19:00",
      "146.940 -0.600 PL 100.0",
      null
    );
    expect(api.setActivityRepeater).toHaveBeenCalledWith("new", "W4ABC Orlando", 28.54, -81.38);
  });

  it("runs a new activity under the default operator, or the one chosen", async () => {
    const user = userEvent.setup();
    const ops = [
      { id: "gmrs", display_name: "Pat", call_sign: "WRAB123", location_label: "", location_lat: null, location_lon: null },
      { id: "ham", display_name: "Pat", call_sign: "K4NCS", location_label: "", location_lon: null, location_lat: null },
    ] as Operator[];
    renderPanel(ops, "gmrs");
    const pick = screen.getByRole("combobox", { name: /Operator/ });
    expect(pick).toHaveValue("gmrs");
    await user.selectOptions(pick, "ham");
    await user.type(screen.getByPlaceholderText("Activity title"), "Ham net{Enter}");
    expect(api.createActivity).toHaveBeenCalledWith("Ham net", "directed_net", expect.any(String), null, "ham");
  });
});
