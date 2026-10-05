import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../types";

vi.mock("../../api", () => ({
  getSettings: vi.fn(),
  fetchNwsAlerts: vi.fn(),
  fetchNwsForecast: vi.fn(),
  fetchCurrentWeather: vi.fn(),
}));
vi.mock("../../workOffline", () => ({
  useWorkOffline: vi.fn(() => false),
  offlineMessage: () => "You're working offline.",
}));
vi.mock("../RadarPanel", () => ({ default: () => null }));
vi.mock("../LocationPicker", () => ({ default: () => null }));

import * as api from "../../api";
import { useWorkOffline } from "../../workOffline";
import WeatherTab from "./WeatherTab";

const SETTINGS: AppSettings = {
  nws_api_key: "",
  qrz_username: "",
  qrz_password: "",
  weather_area_query: "Orlando, FL",
  weather_area_label: "Orlando, Orange County, Florida",
  weather_area_lat: 28.5,
  weather_area_lon: -81.4,
  weather_area_resolved_at: null,
};

const period = (name: string) => ({
  name,
  shortForecast: `${name} storms`,
  detailedForecast: `${name}: storms likely, mainly after 2pm.`,
  temperature: 80,
  temperatureUnit: "F",
});

describe("WeatherTab (NWSA-013)", () => {
  beforeEach(() => {
    vi.mocked(useWorkOffline).mockReturnValue(false);
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    vi.mocked(api.fetchCurrentWeather).mockReset();
    vi.mocked(api.fetchCurrentWeather).mockResolvedValue({
      station_id: "KORL",
      station_name: "Orlando Executive Airport",
      observed_at: "2026-10-05T19:15:00Z",
      temp_c: 26,
      conditions: "Thunderstorms",
      wind_dir_deg: 180,
      wind_speed_kmh: 24.1,
      wind_gust_kmh: null,
    });
    vi.mocked(api.fetchNwsAlerts).mockReset();
    vi.mocked(api.fetchNwsAlerts).mockResolvedValue({
      features: [
        { properties: { severity: "Minor", event: "Flood Advisory" } },
        {
          properties: {
            severity: "Severe",
            event: "Tornado Warning",
            description: "At 312 PM, a tornado\nwas reported.\n\nTake cover now.",
          },
        },
      ],
    });
    vi.mocked(api.fetchNwsForecast).mockReset();
    vi.mocked(api.fetchNwsForecast).mockResolvedValue({
      properties: { periods: ["Tonight", "Tuesday", "Tuesday Night", "Wednesday", "Wednesday Night"].map(period) },
    });
  });

  it("fetches now, the forecast and alerts on opening, and again on Refresh", async () => {
    const user = userEvent.setup();
    render(<WeatherTab />);
    expect(await screen.findByText("Thunderstorms")).toBeInTheDocument();
    expect(screen.getByText("79°F")).toBeInTheDocument();
    expect(screen.getByText("Tonight storms")).toBeInTheDocument();
    expect(screen.getByText(/Weather — Orlando, FL/)).toBeInTheDocument();
    expect(api.fetchCurrentWeather).toHaveBeenCalledWith(28.5, -81.4);
    expect(api.fetchNwsAlerts).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(api.fetchCurrentWeather).toHaveBeenCalledTimes(2);
    expect(api.fetchNwsForecast).toHaveBeenCalledTimes(2);
    expect(api.fetchNwsAlerts).toHaveBeenCalledTimes(2);
  });

  it("shows four forecast periods, the rest on request", async () => {
    const user = userEvent.setup();
    render(<WeatherTab />);
    await screen.findByText("Tonight storms");
    expect(screen.queryByText("Wednesday Night storms")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all 7 days" }));
    expect(screen.getByText("Wednesday Night storms")).toBeInTheDocument();
  });

  it("opens a period's full forecast with its ⓘ button", async () => {
    const user = userEvent.setup();
    render(<WeatherTab />);
    const info = await screen.findByRole("button", { name: "Show the full forecast for Tonight" });
    expect(screen.queryByText("Tonight: storms likely, mainly after 2pm.")).not.toBeInTheDocument();
    await user.click(info);
    expect(screen.getByText("Tonight: storms likely, mainly after 2pm.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide the full forecast for Tonight" }));
    expect(screen.queryByText("Tonight: storms likely, mainly after 2pm.")).not.toBeInTheDocument();
  });

  it("lists warnings first, and opens an alert's text in paragraphs", async () => {
    const user = userEvent.setup();
    render(<WeatherTab />);
    const heads = await screen.findAllByRole("button", { name: /Warning|Advisory/ });
    expect(heads.map((b) => b.textContent)).toEqual(["Tornado Warning", "Flood Advisory"]);
    expect(screen.getByText("Alerts (2)")).toBeInTheDocument();
    await user.click(heads[0]);
    expect(screen.getByText("At 312 PM, a tornado was reported.")).toBeInTheDocument();
    expect(screen.getByText("Take cover now.")).toBeInTheDocument();
  });

  it("asks for an area, fetching nothing, when none is set", async () => {
    vi.mocked(api.getSettings).mockResolvedValue({ ...SETTINGS, weather_area_lat: null, weather_area_lon: null });
    render(<WeatherTab />);
    expect(await screen.findByText(/Set your area/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Weather area" })).toBeInTheDocument();
    expect(api.fetchNwsAlerts).not.toHaveBeenCalled();
    expect(api.fetchNwsForecast).not.toHaveBeenCalled();
    expect(api.fetchCurrentWeather).not.toHaveBeenCalled();
  });

  it("fetches nothing while working offline", async () => {
    vi.mocked(useWorkOffline).mockReturnValue(true);
    render(<WeatherTab />);
    expect(await screen.findByText(/The weather needs the internet/)).toBeInTheDocument();
    expect(api.fetchCurrentWeather).not.toHaveBeenCalled();
    expect(api.fetchNwsAlerts).not.toHaveBeenCalled();
  });

  it("says the service couldn't be reached, without its error text", async () => {
    vi.mocked(api.fetchNwsForecast).mockRejectedValue("NWS API HTTP error: 500");
    render(<WeatherTab />);
    expect(await screen.findByText(/couldn't be reached/)).toBeInTheDocument();
    expect(screen.queryByText(/HTTP error/)).not.toBeInTheDocument();
  });
});
