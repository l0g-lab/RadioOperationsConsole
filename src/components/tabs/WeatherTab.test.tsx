import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, HfConditions } from "../../types";

vi.mock("../../api", () => ({
  getSettings: vi.fn(),
  fetchNwsAlerts: vi.fn(),
  fetchNwsForecast: vi.fn(),
  fetchCurrentWeather: vi.fn(),
  fetchHfConditions: vi.fn(),
}));
vi.mock("../../workOffline", () => ({
  useWorkOffline: vi.fn(() => false),
  offlineMessage: () => "You're working offline.",
}));
const radarProps = vi.hoisted(() => ({ last: null as null | { alerts: { event?: string; geometry?: unknown }[] } }));
vi.mock("../weather/RadarMap", () => ({
  RADAR_REFRESH_MS: 300_000,
  default: (p: { alerts: { event?: string; geometry?: unknown }[] }) => {
    radarProps.last = p;
    return null;
  },
}));
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

/** A quiet day on HF (hf-conditions.md). */
const QUIET_HF: HfConditions = {
  flux: 137,
  flux_at: "2026-10-18T20:00:00+00:00",
  kp: 1.67,
  a_index: 6,
  kp_at: "2026-10-18T18:00:00+00:00",
  r: 0,
  s: 0,
  g: 0,
  scales_at: "2026-10-18T23:44:00+00:00",
  outlook: [],
  absorption: { mhz: 0, valid_at: "", xray: "Normal X-ray Background", proton: "Normal Proton Background", recovery: "" },
};

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
    vi.mocked(api.fetchHfConditions).mockReset();
    vi.mocked(api.fetchHfConditions).mockResolvedValue(QUIET_HF);
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

  it("gives the radar map the alerts with their areas, to outline", async () => {
    const area = { type: "Polygon", coordinates: [[[-81.5, 28.4], [-81.2, 28.4], [-81.2, 28.7], [-81.5, 28.4]]] };
    vi.mocked(api.fetchNwsAlerts).mockResolvedValue({
      features: [
        { properties: { event: "Tornado Warning", severity: "Severe" }, geometry: area },
        { properties: { event: "Heat Advisory", severity: "Minor" }, geometry: null },
      ],
    });
    render(<WeatherTab />);
    await screen.findByText("Alerts (2)");
    expect(radarProps.last?.alerts.map((a) => [a.event, a.geometry ?? null])).toEqual([
      ["Tornado Warning", area],
      ["Heat Advisory", null],
    ]);
  });

  it("checks the alerts again every five minutes while open (NWSA-017)", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const { unmount } = render(<WeatherTab />);
      await screen.findByText("Alerts (2)");
      expect(api.fetchNwsAlerts).toHaveBeenCalledTimes(1);
      vi.mocked(api.fetchNwsAlerts).mockResolvedValue({ features: [{ properties: { event: "Tornado Warning" } }] });
      await act(async () => {
        vi.advanceTimersByTime(300_000);
      });
      expect(api.fetchNwsAlerts).toHaveBeenCalledTimes(2);
      expect(await screen.findByText("Alerts (1)")).toBeInTheDocument();
      // Only the alerts: Now and the forecast wait for Refresh.
      expect(api.fetchNwsForecast).toHaveBeenCalledTimes(1);
      unmount();
      vi.advanceTimersByTime(300_000);
      expect(api.fetchNwsAlerts).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
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
    expect(api.fetchHfConditions).not.toHaveBeenCalled();
  });

  describe("HF conditions (hf-conditions.md)", () => {
    it("is one line on a quiet day, fetched on opening and on Refresh (HFC-001, HFC-010)", async () => {
      const user = userEvent.setup();
      render(<WeatherTab />);
      const line = await screen.findByText((_, el) => el?.className === "hf-summary");
      expect(line.textContent).toBe("Quiet · Solar flux 137 good · K 2 quiet · A 6 quiet");
      expect(screen.getByTitle(/opens the upper HF bands/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Refresh" }));
      expect(api.fetchHfConditions).toHaveBeenCalledTimes(2);
    });

    it("says what's wrong during a flare (HFC-003, HFC-004)", async () => {
      vi.mocked(api.fetchHfConditions).mockResolvedValue({
        ...QUIET_HF,
        r: 2,
        absorption: { ...QUIET_HF.absorption!, mhz: 9, xray: "R2 (Moderate) Radio Blackout in progress" },
      });
      render(<WeatherTab />);
      const line = await screen.findByText((_, el) => el?.className === "hf-summary");
      expect(line.textContent).toBe("Solar flux 137 good · K 2 quiet · A 6 quiet");
      expect(screen.getByText(/^R2 \(moderate\) radio blackout/)).toBeInTheDocument();
      expect(screen.getByText(/^HF below 9 MHz weakened by absorption here/)).toBeInTheDocument();
    });

    it("checks again every 15 minutes, keeping the last reading when it can't (HFC-010, HFC-011)", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      try {
        render(<WeatherTab />);
        await screen.findByText((_, el) => el?.className === "hf-summary");
        vi.mocked(api.fetchHfConditions).mockRejectedValue("HTTP 503");
        await act(async () => {
          vi.advanceTimersByTime(15 * 60_000);
        });
        expect(api.fetchHfConditions).toHaveBeenCalledTimes(2);
        expect(await screen.findByText(/space weather service couldn't be reached — showing the last reading/)).toBeInTheDocument();
        expect(screen.getByText((_, el) => el?.className === "hf-summary").textContent).toMatch(/^Quiet · Solar flux 137/);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("says the service couldn't be reached, without its error text", async () => {
    vi.mocked(api.fetchNwsForecast).mockRejectedValue("NWS API HTTP error: 500");
    render(<WeatherTab />);
    expect(await screen.findByText(/couldn't be reached/)).toBeInTheDocument();
    expect(screen.queryByText(/HTTP error/)).not.toBeInTheDocument();
  });
});
