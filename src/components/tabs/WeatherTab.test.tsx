import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../types";

vi.mock("../../api", () => ({
  getSettings: vi.fn(),
  fetchNwsAlerts: vi.fn(),
  fetchNwsForecast: vi.fn(),
}));
vi.mock("../RadarPanel", () => ({ default: () => null }));
vi.mock("../LocationPicker", () => ({ default: () => null }));

import * as api from "../../api";
import WeatherTab from "./WeatherTab";

const SETTINGS: AppSettings = {
  nws_api_key: "",
  qrz_username: "",
  qrz_password: "",
  weather_area_query: "Orlando",
  weather_area_label: "Orlando, FL",
  weather_area_lat: 28.5,
  weather_area_lon: -81.4,
  weather_area_resolved_at: null,
};

describe("WeatherTab fetching (NWSA-013, NWSA-022)", () => {
  beforeEach(() => {
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    vi.mocked(api.fetchNwsAlerts).mockReset();
    vi.mocked(api.fetchNwsAlerts).mockResolvedValue({
      features: [{ properties: { severity: "Severe", event: "Tornado Warning" } }],
    });
    vi.mocked(api.fetchNwsForecast).mockReset();
    vi.mocked(api.fetchNwsForecast).mockResolvedValue({
      properties: { periods: [{ name: "Tonight", shortForecast: "Storms" }] },
    });
  });

  it("fetches nothing until a section is opened", async () => {
    render(<WeatherTab />);
    await screen.findByRole("button", { name: "Show alerts" });
    expect(api.fetchNwsAlerts).not.toHaveBeenCalled();
    expect(api.fetchNwsForecast).not.toHaveBeenCalled();
  });

  it("shows alerts with one click, and Refresh fetches again", async () => {
    const user = userEvent.setup();
    render(<WeatherTab />);
    await user.click(await screen.findByRole("button", { name: "Show alerts" }));
    expect(await screen.findByText(/Tornado Warning/)).toBeInTheDocument();
    expect(api.fetchNwsAlerts).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Fetched \d{2}:\d{2}/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh alerts" }));
    expect(api.fetchNwsAlerts).toHaveBeenCalledTimes(2);
  });

  it("shows the forecast with one click", async () => {
    const user = userEvent.setup();
    render(<WeatherTab />);
    await user.click(await screen.findByRole("button", { name: "Show forecast" }));
    expect(await screen.findByText("Storms")).toBeInTheDocument();
    expect(api.fetchNwsForecast).toHaveBeenCalledTimes(1);
  });

  it("doesn't try a forecast with no area set", async () => {
    vi.mocked(api.getSettings).mockResolvedValue({
      ...SETTINGS,
      weather_area_lat: null,
      weather_area_lon: null,
    });
    const user = userEvent.setup();
    render(<WeatherTab />);
    await user.click(await screen.findByRole("button", { name: "Show forecast" }));
    expect(screen.getByText(/Set an area of interest/)).toBeInTheDocument();
    expect(api.fetchNwsForecast).not.toHaveBeenCalled();
  });
});
