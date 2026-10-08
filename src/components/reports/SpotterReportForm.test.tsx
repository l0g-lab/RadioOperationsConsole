import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Checkin } from "../../types";

vi.mock("../../api", () => ({
  createSpotterReport: vi.fn(() => Promise.resolve("r1")),
  updateSpotterReport: vi.fn(),
  setCheckinTrafficHandled: vi.fn(() => Promise.resolve()),
  createCheckin: vi.fn(() => Promise.resolve("new-line")),
  resolveMileMarker: vi.fn(() => Promise.resolve(null)),
  geocodeLocation: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../../quickCheckin", () => ({
  checkInCallSign: vi.fn(() => Promise.resolve("new-checkin")),
}));
vi.mock("../../locationResolution", () => ({
  resolveOfflineLocationAsync: vi.fn(() => Promise.resolve(null)),
}));

import * as api from "../../api";
import { checkInCallSign } from "../../quickCheckin";
import SpotterReportForm, {
  linkedCheckin,
  reporterIsCallSign,
  reporterSuggestions,
  reportTrafficText,
} from "./SpotterReportForm";

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

describe("reporterIsCallSign", () => {
  it("takes one amateur or GMRS call sign, not a name", () => {
    expect(reporterIsCallSign(" w4abc ")).toBe(true);
    expect(reporterIsCallSign("WRAB123")).toBe(true);
    expect(reporterIsCallSign("A neighbour")).toBe(false);
    expect(reporterIsCallSign("Orange County EM")).toBe(false);
    expect(reporterIsCallSign("")).toBe(false);
  });
});

describe("reportTrafficText (SPOT-026)", () => {
  it("says the report briefly, for a check-in line's traffic", () => {
    expect(reportTrafficText("Hail", "1.00 in (Quarter) — Severe threshold", " Main & 5th", "Orange")).toBe(
      "Hail 1.00 in (Quarter), Main & 5th, Orange Co."
    );
    expect(reportTrafficText("Tornado", "Funnel cloud (no ground contact)", "", "")).toBe(
      "Tornado Funnel cloud (no ground contact)"
    );
  });
});

describe("linkedCheckin", () => {
  it("links a call sign, or the label earlier reports were saved with", () => {
    expect(linkedCheckin("w4abc ", [al])).toBe(al);
    expect(linkedCheckin("W4ABC (Al Smith)", [al])).toBe(al);
    expect(linkedCheckin("A neighbour", [al])).toBeNull();
  });
});

function renderForm(startFrom: { checkin: Checkin; n: number } | null = null, checkins = [al]) {
  return render(
    <SpotterReportForm
      activityId="a1"
      operatorId="op1"
      checkins={checkins}
      editingReport={null}
      startFrom={startFrom}
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
  beforeEach(() => {
    vi.mocked(api.createSpotterReport).mockClear();
    vi.mocked(api.setCheckinTrafficHandled).mockClear();
    vi.mocked(checkInCallSign).mockClear();
    vi.mocked(api.createCheckin).mockClear();
  });

  it("starts from a roster row's station, with its traffic, and leaves the traffic open", async () => {
    const user = userEvent.setup();
    const withTraffic = { ...al, has_traffic: true, traffic_handled: false, traffic: "Hail at Main & 5th" };
    renderForm({ checkin: withTraffic, n: 1 }, [withTraffic]);
    expect(screen.getByRole("combobox", { name: "Reporter" })).toHaveValue("W4ABC");
    expect(screen.getByRole("textbox", { name: "Details (optional)" })).toHaveValue("Hail at Main & 5th");
    expect(screen.queryByText(/new check-in/)).not.toBeInTheDocument();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Save report" }));
    expect(vi.mocked(api.createSpotterReport).mock.calls[0][11]).toBe("c1");
    // Open until ticked Handled on the roster, once passed on.
    expect(api.setCheckinTrafficHandled).not.toHaveBeenCalled();
    expect(api.createCheckin).not.toHaveBeenCalled();
  });

  it("links a report taken with a row's Report to that row, traffic waiting or not", async () => {
    const user = userEvent.setup();
    renderForm({ checkin: { ...al, has_traffic: false }, n: 1 });
    expect(screen.getByText(/Linked to W4ABC \(Al Smith\)'s check-in\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/new check-in/)).not.toBeInTheDocument();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Save report" }));
    expect(vi.mocked(api.createSpotterReport).mock.calls[0][11]).toBe("c1");
    expect(api.createCheckin).not.toHaveBeenCalled();
    expect(api.setCheckinTrafficHandled).not.toHaveBeenCalled();
  });

  it("logs a new line when the reporter is changed to another station", async () => {
    const user = userEvent.setup();
    const withTraffic = { ...al, has_traffic: true, traffic_handled: false, traffic: "Leaving at 20:00" };
    renderForm({ checkin: withTraffic, n: 1 }, [withTraffic, bo]);
    const reporter = screen.getByRole("combobox", { name: "Reporter" });
    await user.clear(reporter);
    await user.type(reporter, "KD4XYZ");
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Save report" }));
    expect(vi.mocked(api.createCheckin).mock.calls[0][1]).toBe("KD4XYZ");
    expect(vi.mocked(api.createSpotterReport).mock.calls[0][11]).toBe("new-line");
    expect(api.setCheckinTrafficHandled).not.toHaveBeenCalled();
  });

  it("checks in a reporter not on the roster", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByRole("combobox", { name: "Reporter" }), "n4qqq");
    expect(screen.getByText(/Saving checks in N4QQQ too/)).toBeInTheDocument();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Save report" }));
    expect(checkInCallSign).toHaveBeenCalledWith("a1", "N4QQQ", "op1", false, expect.stringMatching(/^Hail /), null);
    expect(api.setCheckinTrafficHandled).not.toHaveBeenCalled();
    const args = vi.mocked(api.createSpotterReport).mock.calls[0];
    expect([args[6], args[11]]).toEqual(["N4QQQ", "new-checkin"]);
  });

  it("doesn't check in or link a reporter who isn't a call sign", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByRole("combobox", { name: "Reporter" }), "Orange County EM");
    expect(screen.queryByText(/Saving (logs|checks)/)).not.toBeInTheDocument();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Save report" }));
    expect(checkInCallSign).not.toHaveBeenCalled();
    expect(api.createCheckin).not.toHaveBeenCalled();
    expect(vi.mocked(api.createSpotterReport).mock.calls[0][11]).toBeNull();
  });

  it("suggests checked-in stations, and gives the report its own check-in line", async () => {
    const user = userEvent.setup();
    renderForm();
    const reporter = screen.getByRole("combobox", { name: "Reporter" });
    await user.type(reporter, "smi");
    expect(screen.getByRole("listbox", { name: "Checked-in stations" })).toHaveTextContent("W4ABCAl Smith");
    await user.keyboard("{Enter}"); // takes the suggestion, doesn't save
    expect(reporter).toHaveValue("W4ABC");
    expect(api.createSpotterReport).not.toHaveBeenCalled();
    expect(screen.getByText(/Saving logs a new check-in for W4ABC/)).toBeInTheDocument();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Save report" }));
    const args = vi.mocked(api.createSpotterReport).mock.calls[0];
    expect(args[6]).toBe("W4ABC");
    expect(args[11]).toBe("new-line");
  });

  it("gives a report from a station on the roster a check-in line of its own", async () => {
    const user = userEvent.setup();
    const placed = { ...al, location_lat: 28.5, location_lon: -81.3, location_label: "Winter Park", location_manual: false };
    renderForm(null, [placed]);
    await user.type(screen.getByRole("combobox", { name: "Reporter" }), "W4ABC");
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Save report" }));
    const line = vi.mocked(api.createCheckin).mock.calls[0];
    // The same station again, where it was placed, with the report as its traffic.
    expect([line[1], line[2], line[7], line[8], line[10]]).toEqual(["W4ABC", "Al Smith", 28.5, -81.3, true]);
    expect(line[11]).toMatch(/^Hail .*, Orange Co\.$/);
    expect(api.setCheckinTrafficHandled).not.toHaveBeenCalled();
    expect(vi.mocked(api.createSpotterReport).mock.calls[0][11]).toBe("new-line");
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
