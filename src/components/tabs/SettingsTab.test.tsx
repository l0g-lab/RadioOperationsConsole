import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../types";

const STORED: AppSettings = {
  nws_api_key: "",
  qrz_username: "",
  qrz_password: "",
  weather_area_query: "",
  weather_area_label: "",
  weather_area_lat: null,
  weather_area_lon: null,
  weather_area_resolved_at: null,
};

vi.mock("../../api", () => ({
  getSettings: vi.fn(() => Promise.resolve(STORED)),
  saveSettings: vi.fn(() => Promise.resolve()),
}));
vi.mock("../settings/BackupPanel", () => ({ default: () => null }));
vi.mock("../settings/OfflineDataPanel", () => ({ default: () => null }));

import * as api from "../../api";
import SettingsTab from "./SettingsTab";

describe("SettingsTab save control", () => {
  beforeEach(() => vi.mocked(api.saveSettings).mockClear());

  it("renders Save settings as the primary action", () => {
    render(<SettingsTab />);
    expect(screen.getByRole("button", { name: "Save settings" })).toHaveClass("primary");
  });

  it("flags unsaved changes after an edit and clears the flag on save", async () => {
    const user = userEvent.setup();
    render(<SettingsTab />);
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("QRZ username"), "N0CALL");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ qrz_username: "N0CALL" }));
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});
