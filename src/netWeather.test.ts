import { describe, expect, it } from "vitest";
import { compassPoint, weatherLines, weatherText } from "./netWeather";
import type { ActivityWeather } from "./types";

const reading = (o: Partial<ActivityWeather> = {}): ActivityWeather => ({
  moment: "start",
  outcome: "ok",
  place: "repeater",
  station_id: "KORL",
  station_name: "",
  observed_at: "2026-10-05T23:15:00Z",
  temp_c: 26,
  conditions: "Thunderstorms",
  wind_dir_deg: 200,
  wind_speed_kmh: 24.1,
  wind_gust_kmh: 40.2,
  alerts: [],
  ...o,
});

describe("weatherText", () => {
  it("gives °F, conditions, and the wind in mph with where it's from", () => {
    expect(weatherText(reading())).toBe("79°F, Thunderstorms, wind S 15 mph gusting 25");
  });
  it("leaves out what the station didn't report, and says calm for no wind", () => {
    expect(weatherText(reading({ temp_c: null, wind_gust_kmh: null, wind_dir_deg: null }))).toBe(
      "Thunderstorms, wind 15 mph"
    );
    expect(weatherText(reading({ conditions: "", wind_speed_kmh: 0 }))).toBe("79°F, calm");
  });
});

describe("compassPoint", () => {
  it("rounds to the nearest of eight points", () => {
    expect([0, 44, 90, 200, 337, 359, -45].map(compassPoint)).toEqual(["N", "NE", "E", "S", "NW", "N", "NW"]);
  });
});

describe("weatherLines", () => {
  it("gives the reading with its alerts, or why there's none, without the service's error", () => {
    const lines = weatherLines([
      reading({ alerts: ["Severe Thunderstorm Warning"] }),
      reading({ moment: "end", outcome: "error", alerts: ["ignored"] }),
    ]);
    expect(lines[0]).toEqual({
      label: "Start",
      text: "79°F, Thunderstorms, wind S 15 mph gusting 25",
      alerts: ["Severe Thunderstorm Warning"],
      missing: false,
    });
    expect(lines[1]).toEqual({
      label: "End",
      text: "Not recorded — the weather service couldn't be reached",
      alerts: [],
      missing: true,
    });
    expect(weatherLines([reading({ outcome: "offline" })])[0].text).toBe("Not recorded — working offline");
    expect(weatherLines([reading({ outcome: "no_place" })])[0].text).toMatch(/no repeater or net control location/);
  });
});
