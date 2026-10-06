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
  checkQrzLogin: vi.fn(() => Promise.resolve()),
}));
vi.mock("../settings/BackupPanel", () => ({ default: () => null }));
vi.mock("../settings/OfflineDataPanel", () => ({ default: () => null }));

import * as api from "../../api";
import SettingsTab from "./SettingsTab";

describe("SettingsTab (SET-020)", () => {
  beforeEach(() => {
    vi.mocked(api.saveSettings).mockClear();
    vi.mocked(api.checkQrzLogin).mockReset();
    vi.mocked(api.checkQrzLogin).mockResolvedValue();
  });

  it("saves a box as you leave it, only if it changed, and says so", async () => {
    const user = userEvent.setup();
    render(<SettingsTab />);
    const username = await screen.findByLabelText("QRZ username");
    await user.click(username);
    await user.tab();
    expect(api.saveSettings).not.toHaveBeenCalled();

    await user.type(username, "N0CALL");
    await user.tab();
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ qrz_username: "N0CALL" }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save settings|Reset to defaults/ })).not.toBeInTheDocument();
  });

  it("checks the QRZ login, saving it first, and says how it went", async () => {
    const user = userEvent.setup();
    render(<SettingsTab />);
    const check = await screen.findByRole("button", { name: "Check login" });
    expect(check).toBeDisabled();
    await user.type(screen.getByLabelText("QRZ username"), "W0LAB");
    await user.type(screen.getByLabelText("QRZ password"), "secret");
    await user.click(check);
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ qrz_username: "W0LAB", qrz_password: "secret" }));
    expect(await screen.findByText("✓ QRZ accepted the login for W0LAB")).toBeInTheDocument();

    vi.mocked(api.checkQrzLogin).mockRejectedValue("Username/password incorrect");
    await user.click(screen.getByRole("button", { name: "Check login" }));
    expect(await screen.findByText("Username/password incorrect")).toBeInTheDocument();
  });
});
