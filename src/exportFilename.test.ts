import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "./types";

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn(), open: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock("@tauri-apps/api/path", () => ({ join: vi.fn() }));
vi.mock("./api", () => ({
  allowExportExtension: vi.fn((path: string, ext: string) => Promise.resolve(`${path}.${ext}`)),
}));

import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { allowExportExtension } from "./api";
import { exportFilename, saveTextFile } from "./export";

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    title: "Tuesday Net",
    activity_type: "directed_net",
    scheduled_at: "",
    frequency: "",
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
    ...overrides,
  };
}

describe("exportFilename (EXPORT-007)", () => {
  it("uses the title, the local start date and time, the kind, and the extension", () => {
    const opened = new Date(2026, 8, 21, 19, 4).toISOString();
    expect(
      exportFilename(activity({ opened_at: opened, state: "active" }), "Check-ins", "csv")
    ).toBe("Tuesday Net - 2026-09-21 1904 - Check-ins.csv");
  });

  it("falls back to the scheduled date and time before the activity starts", () => {
    expect(exportFilename(activity({ scheduled_at: "2026-09-22 19:30" }), "Summary", "txt")).toBe(
      "Tuesday Net - 2026-09-22 1930 - Summary.txt"
    );
    expect(exportFilename(activity({ scheduled_at: "2026-09-22" }), "Summary", "txt")).toBe(
      "Tuesday Net - 2026-09-22 - Summary.txt"
    );
  });

  it("leaves the date out when there is none", () => {
    expect(exportFilename(activity(), "History", "csv")).toBe("Tuesday Net - History.csv");
  });

  it("removes characters that aren't allowed in filenames and names an untitled activity", () => {
    expect(
      exportFilename(activity({ title: '  SKYWARN: "Storm" 9/21?  ' }), "Summary", "txt")
    ).toBe("SKYWARN Storm 9 21 - Summary.txt");
    expect(exportFilename(activity({ title: "  " }), "Summary", "txt")).toBe(
      "Activity - Summary.txt"
    );
  });
});

describe("saveTextFile extension (EXPORT-008)", () => {
  beforeEach(() => {
    vi.mocked(save).mockReset();
    vi.mocked(writeTextFile).mockReset();
  });

  it("offers a filter for the file's type", async () => {
    vi.mocked(save).mockResolvedValue("/home/op/Net - Check-ins.csv");
    await saveTextFile("Net - Check-ins.csv", "x");
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: "Net - Check-ins.csv",
        filters: [expect.objectContaining({ extensions: ["csv"] })],
      })
    );
  });

  it("adds the extension back when the chosen name has lost it", async () => {
    vi.mocked(save).mockResolvedValue("/home/op/my log");
    expect(await saveTextFile("Net - Check-ins.csv", "x")).toBe("/home/op/my log.csv");
    // Only the backend can allow that name, since the dialog allowed the one typed.
    expect(allowExportExtension).toHaveBeenCalledWith("/home/op/my log", "csv");
    expect(writeTextFile).toHaveBeenCalledWith("/home/op/my log.csv", "x");
  });

  it("keeps a name that already ends in the extension, in any case", async () => {
    vi.mocked(save).mockResolvedValue("C:\\Logs\\NET.CSV");
    expect(await saveTextFile("Net - Check-ins.csv", "x")).toBe("C:\\Logs\\NET.CSV");
  });

  it("returns null when the dialog is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);
    expect(await saveTextFile("Net - Check-ins.csv", "x")).toBeNull();
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});
