import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Operator } from "../../types";

vi.mock("../../api", () => ({
  createActivity: vi.fn(() => Promise.resolve("new")),
  saveActivityTemplate: vi.fn(),
  setActivityLocationCoords: vi.fn(() => Promise.resolve()),
}));

// The real picker is a Leaflet map; this stands in for choosing a point.
vi.mock("../LocationPicker", () => ({
  default: (props: { onSave: (lat: number, lon: number, label: string) => void }) => (
    <button onClick={() => props.onSave(28.5, -81.4, "Repeater site")}>Choose point</button>
  ),
}));

import * as api from "../../api";
import CreateActivityPanel from "./CreateActivityPanel";

function renderPanel(operators: Operator[] = [], selectedOperatorId: string | null = null) {
  return render(
    <CreateActivityPanel
      activities={[]}
      onActivitiesChanged={() => {}}
      onSelectActivity={() => {}}
      operators={operators}
      selectedOperatorId={selectedOperatorId}
      templates={[]}
      onTemplatesChanged={() => {}}
      useTemplateRequest={null}
      onUseTemplateHandled={() => {}}
    />
  );
}

describe("CreateActivityPanel", () => {
  beforeEach(() => vi.mocked(api.createActivity).mockClear());

  it("asks a net for its date, but not a station log, which is saved undated", async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(screen.getByText(/Date \(YYYY-MM-DD\)/)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: /type/i }), "station_log");
    expect(screen.queryByText(/Date \(YYYY-MM-DD\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Time \(HH:MM/)).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Activity title"), "VHF Simplex{Enter}");
    expect(api.createActivity).toHaveBeenCalledWith("VHF Simplex", "station_log", null, null);
  });

  it("won't create a range check until the repeater location is set, ignoring the operator's (RANGE-002)", async () => {
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
    expect(screen.getByText(/needs the repeater's location/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Set repeater location" }));
    await user.click(screen.getByRole("button", { name: "Choose point" }));
    await user.click(screen.getByRole("button", { name: "Create activity" }));
    expect(api.createActivity).toHaveBeenCalledWith("Range check", "range_check", expect.any(String), null);
    expect(api.setActivityLocationCoords).toHaveBeenCalledWith("new", 28.5, -81.4, "Repeater site");
  });
});
