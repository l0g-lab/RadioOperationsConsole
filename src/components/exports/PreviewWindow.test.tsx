import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, Checkin, SpotterReport } from "../../types";

vi.mock("../../api", () => ({
  listCheckins: vi.fn(),
  listSpotterReports: vi.fn(),
  activityHistory: vi.fn(() => Promise.resolve([])),
  activitySummary: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../../export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../export")>()),
  saveTextFile: vi.fn(() => Promise.resolve("/home/pat/checkins.csv")),
}));

import * as api from "../../api";
import { checkinsToCsv, saveTextFile, spotterReportsToText } from "../../export";
import { CsvPreviewDialog } from "./PreviewWindow";
import ExportOptions from "./ExportOptions";

const CSV = 'Call Sign,Name,Notes\r\nKD4ABC,"Pat ""PJ"" Jones","Mobile, I-75\nnear exit 3"\r\nW1AW,Hiram,\r\n';

describe("CsvPreviewDialog (EXPORT-018)", () => {
  beforeEach(() => vi.mocked(saveTextFile).mockClear());

  it("shows the CSV as a table, read back exactly", () => {
    render(<CsvPreviewDialog heading="Check-ins — Tuesday Net" filename="c.csv" csv={CSV} what="the check-ins" onClose={() => {}} />);
    expect(screen.getByText("2 rows, 3 columns — exactly what the CSV file holds.")).toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Call Sign", "Name", "Notes"]);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "KD4ABC",
      'Pat "PJ" Jones',
      "Mobile, I-75\nnear exit 3",
    ]);
  });

  it("shows the raw text on request, and saves exactly that", async () => {
    const user = userEvent.setup();
    render(<CsvPreviewDialog heading="Check-ins" filename="c.csv" csv={CSV} what="the check-ins" onClose={() => {}} />);
    await user.click(screen.getByRole("checkbox", { name: "Show as text" }));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/KD4ABC,"Pat ""PJ"" Jones"/).textContent).toBe(CSV);

    await user.click(screen.getByRole("button", { name: "Save…" }));
    expect(saveTextFile).toHaveBeenCalledWith("c.csv", CSV);
    expect(await screen.findByText("Saved to /home/pat/checkins.csv")).toBeInTheDocument();
  });
});

describe("ExportOptions Show CSV", () => {
  const NET = {
    id: "a1",
    title: "Tuesday Net",
    activity_type: "directed_net",
    scheduled_at: "2026-09-29 19:00",
    frequency: "",
    location_label: "",
    location_lat: null,
    location_lon: null,
    state: "active",
    opened_at: "",
    closed_at: "",
    conclusion: "",
    repeater_name: "",
    repeater_lat: null,
    repeater_lon: null,
  } as Activity;
  const CHECKIN = {
    id: "c1",
    call_sign: "KD4ABC",
    name: "Pat",
    qth_location: "Orlando",
    grid_square: "",
    address: "",
    checked_in_at: "2026-09-29T23:05:00Z",
    location_lat: null,
    location_lon: null,
    location_label: "",
    has_traffic: false,
    traffic: "",
    traffic_handled: false,
    frequency: "",
    mode: "",
    rst_sent: "",
    rst_received: "",
    power: "",
    antenna: "",
    notes: "",
    station_kind: "",
    cross_street: "",
  } as Checkin;

  it("opens the check-ins CSV as a table", async () => {
    vi.mocked(api.listCheckins).mockResolvedValue([CHECKIN]);
    vi.mocked(api.listSpotterReports).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<ExportOptions activity={NET} operator={null} />);
    await screen.findByText("1 record");
    const showButtons = screen.getAllByRole("button", { name: "Show CSV" });
    await user.click(showButtons[0]);
    const dialog = await screen.findByRole("dialog", { name: "Check-ins — Tuesday Net" });
    expect(within(dialog).getByRole("cell", { name: "KD4ABC" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Save…" }));
    expect(saveTextFile).toHaveBeenLastCalledWith(expect.stringContaining("Check-ins"), checkinsToCsv([CHECKIN]));
  });

  it("shows the spotter text report before saving", async () => {
    const REPORT: SpotterReport = {
      id: "r1",
      activity_id: "a1",
      operator_id: "",
      reported_at: "2026-09-29T23:10:00Z",
      county: "Orange",
      location_text: "Colonial & Mills",
      lat: null,
      lon: null,
      reporter: "KD4ABC",
      hazard_type: "Hail",
      magnitude: "1.00 in",
      source: "",
      notes: "",
      checkin_id: null,
    };
    vi.mocked(api.listCheckins).mockResolvedValue([CHECKIN]);
    vi.mocked(api.listSpotterReports).mockResolvedValue([REPORT]);
    const user = userEvent.setup();
    render(<ExportOptions activity={NET} operator={null} />);
    await screen.findByText("1 report");

    await user.click(screen.getByRole("button", { name: "Show text report" }));
    const dialog = await screen.findByRole("dialog", { name: "Spotter reports — Tuesday Net" });
    expect(within(dialog).getByText(/Hail/).textContent).toBe(spotterReportsToText(NET, [REPORT]));
  });
});
