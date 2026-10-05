import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Checkin } from "../../types";

vi.mock("../../api", () => ({
  createSpotterReport: vi.fn(() => Promise.resolve("r1")),
  updateSpotterReport: vi.fn(),
  resolveMileMarker: vi.fn(() => Promise.resolve(null)),
  geocodeLocation: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../../locationResolution", () => ({
  resolveOfflineLocationAsync: vi.fn(() => Promise.resolve(null)),
}));

import * as api from "../../api";
import SpotterReportForm, { linkedCheckin, reporterSuggestions } from "./SpotterReportForm";

const al = { id: "c1", call_sign: "w4abc", name: "Al Smith" } as Checkin;
const bo = { id: "c2", call_sign: "KD4XYZ", name: "Bo Wade" } as Checkin;
const wanda = { id: "c3", call_sign: "W4WAD", name: "Wanda Jones" } as Checkin;

describe("reporterSuggestions", () => {
  const all = [al, bo, wanda];
  it("matches call signs first, then names", () => {
    expect(reporterSuggestions("w4", all)).toEqual([al, wanda]);
    expect(reporterSuggestions("wa", all)).toEqual([bo, wanda]);
    expect(reporterSuggestions("smi", all)).toEqual([al]);
  });
  it("lists each station once and nothing once a call sign is typed in full", () => {
    expect(reporterSuggestions("w4a", [al, { ...al, id: "c9" }])).toEqual([al]);
    expect(reporterSuggestions("W4ABC", all)).toEqual([]);
    expect(reporterSuggestions(" ", all)).toEqual([]);
  });
});

describe("linkedCheckin", () => {
  it("links a call sign, or the label earlier reports were saved with", () => {
    expect(linkedCheckin("w4abc ", [al])).toBe(al);
    expect(linkedCheckin("W4ABC (Al Smith)", [al])).toBe(al);
    expect(linkedCheckin("A neighbour", [al])).toBeNull();
  });
});

function renderForm() {
  return render(
    <SpotterReportForm
      activityId="a1"
      operatorId="op1"
      checkins={[al]}
      editingReport={null}
      onSaved={() => {}}
      onCancelEdit={() => {}}
    />
  );
}

/** Fills in what a report needs: hail of a given size somewhere. */
async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByRole("combobox", { name: "Hazard" }), "Hail");
  const magnitude = screen.getByRole("combobox", { name: "Magnitude" });
  await user.selectOptions(magnitude, (magnitude as HTMLSelectElement).options[1].value);
  await user.type(screen.getByRole("combobox", { name: "County" }), "Orange");
}

describe("SpotterReportForm", () => {
  beforeEach(() => vi.mocked(api.createSpotterReport).mockClear());

  it("links the report when the reporter is a station that checked in", async () => {
    const user = userEvent.setup();
    renderForm();
    const reporter = screen.getByRole("combobox", { name: "Reporter" });
    await user.type(reporter, "smi");
    expect(screen.getByRole("listbox", { name: "Checked-in stations" })).toHaveTextContent("W4ABCAl Smith");
    await user.keyboard("{Enter}"); // takes the suggestion, doesn't save
    expect(reporter).toHaveValue("W4ABC");
    expect(api.createSpotterReport).not.toHaveBeenCalled();
    expect(screen.getByText(/Linked to W4ABC \(Al Smith\)'s check-in/)).toBeInTheDocument();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Save report" }));
    const args = vi.mocked(api.createSpotterReport).mock.calls[0];
    expect(args[6]).toBe("W4ABC");
    expect(args[11]).toBe("c1");
  });

  it("fills in a station with Tab and moves on", async () => {
    const user = userEvent.setup();
    renderForm();
    const reporter = screen.getByRole("combobox", { name: "Reporter" });
    await user.type(reporter, "w4");
    await user.tab();
    expect(reporter).toHaveValue("W4ABC");
    expect(reporter).not.toHaveFocus();
  });

  it("takes a typed time, and refuses one it can't read", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByRole("combobox", { name: "Reporter" }), "A neighbour");
    await fillRequired(user);
    const time = screen.getByRole("textbox", { name: "Time" });
    await user.type(time, "yesterday");
    await user.click(screen.getByRole("button", { name: "Save report" }));
    expect(api.createSpotterReport).not.toHaveBeenCalled();
    expect(screen.getByText(/isn't a time/)).toBeInTheDocument();

    await user.clear(time);
    await user.type(time, "2026-10-05 19:20");
    await user.click(screen.getByRole("button", { name: "Save report" }));
    const args = vi.mocked(api.createSpotterReport).mock.calls[0];
    expect(args[1]).toBe(new Date(2026, 9, 5, 19, 20).toISOString());
    expect(args[11]).toBeNull(); // typed, not a checked-in station
  });
});
