import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Repeater } from "../../types";

vi.mock("../../api", () => ({
  listRepeaters: vi.fn(() => Promise.resolve([])),
  saveRepeater: vi.fn(() => Promise.resolve("r1")),
  setRepeaterRetired: vi.fn(() => Promise.resolve()),
}));

import * as api from "../../api";
import RepeatersPanel from "./RepeatersPanel";

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
  location_lat: null,
  location_lon: null,
  notes: "",
  retired_at: "",
};

function renderPanel(repeaters: Repeater[] = []) {
  return render(
    <RepeatersPanel repeaters={repeaters} onRepeatersChanged={() => {}} selectedOperatorId="op1" />
  );
}

describe("RepeatersPanel", () => {
  beforeEach(() => {
    vi.mocked(api.saveRepeater).mockClear();
    vi.mocked(api.setRepeaterRetired).mockClear();
  });

  it("adds a repeater, suggesting the band's offset once a direction is chosen (RPT-001–003)", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "+ Add repeater" }));
    await user.type(screen.getByLabelText("Repeater name"), "W4ABC Orlando");
    await user.type(screen.getByLabelText("Output frequency"), "146.94");

    // The direction is never assumed.
    await user.click(screen.getByRole("button", { name: "Save repeater" }));
    expect(screen.getByText(/Choose the offset/)).toBeInTheDocument();
    expect(api.saveRepeater).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText("Offset direction"), "-");
    expect(screen.getByLabelText("Offset amount")).toHaveValue("0.600");
    await user.selectOptions(screen.getByLabelText("Input tone type"), "pl");
    await user.selectOptions(screen.getByLabelText("Input tone"), "100.0");
    expect(screen.getByText("146.940 -0.600 PL 100.0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save repeater" }));

    expect(api.saveRepeater).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        name: "W4ABC Orlando",
        output_mhz: 146.94,
        offset_mhz: -0.6,
        tone_in_kind: "pl",
        tone_in: "100.0",
        // "Same as input" by default.
        tone_out_kind: "pl",
        tone_out: "100.0",
      }),
      "op1"
    );
  });

  it("takes a DCS code with its polarity", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "+ Add repeater" }));
    await user.type(screen.getByLabelText("Repeater name"), "K4UHF");
    await user.type(screen.getByLabelText("Output frequency"), "444.5");
    await user.selectOptions(screen.getByLabelText("Offset direction"), "+");
    await user.selectOptions(screen.getByLabelText("Input tone type"), "dcs");
    await user.selectOptions(screen.getByLabelText("Input tone"), "023");
    await user.selectOptions(screen.getByLabelText("Input tone polarity"), "I");
    await user.selectOptions(screen.getByLabelText("Output tone type"), "none");
    await user.click(screen.getByRole("button", { name: "Save repeater" }));
    expect(vi.mocked(api.saveRepeater).mock.calls[0][1]).toMatchObject({
      offset_mhz: 5,
      tone_in_kind: "dcs",
      tone_in: "023I",
      tone_out_kind: "none",
      tone_out: "",
    });
  });

  it("lists, edits and retires repeaters (RPT-010)", async () => {
    const user = userEvent.setup();
    renderPanel([W4ABC]);
    // The list shows the output frequency; Show opens the full details.
    expect(screen.getByText("146.940")).toBeInTheDocument();
    expect(screen.queryByText(/Input 146.340/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show W4ABC Orlando" }));
    expect(screen.getByText(/Input 146.340 \(-0.600\) · Tone PL 100.0/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit W4ABC Orlando" }));
    expect(screen.getByLabelText("Offset direction")).toHaveValue("-");
    expect(screen.getByLabelText("Output tone type")).toHaveValue("same");
    await user.click(screen.getByRole("button", { name: "Save repeater" }));
    expect(vi.mocked(api.saveRepeater).mock.calls[0][0]).toBe("r1");

    await user.click(screen.getByRole("button", { name: "Retire W4ABC Orlando" }));
    expect(api.setRepeaterRetired).toHaveBeenCalledWith("r1", true, "op1");
  });
});
