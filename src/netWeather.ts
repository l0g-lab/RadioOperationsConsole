/**
 * The weather as a net started and ended (docs/features/net-weather.md), read
 * in the background from the NWS station nearest the repeater, else net
 * control. Shown in the summary in US units, as NWS gives them to the public.
 */
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ActivityWeather, WeatherOutcome, WeatherReading } from "./types";

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** 180 -> "S"; the nearest of the eight compass points. */
export function compassPoint(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

const mph = (kmh: number) => Math.round(kmh / 1.609344);

/** 26 -> "79°F". */
export function fahrenheit(c: number): string {
  return `${Math.round((c * 9) / 5 + 32)}°F`;
}

/** "wind S 15 mph gusting 25", "calm", or "" when the station gave no wind. */
export function windText(w: WeatherReading): string {
  if (w.wind_speed_kmh == null) return "";
  const speed = mph(w.wind_speed_kmh);
  if (speed === 0) return "calm";
  const from = w.wind_dir_deg != null ? `${compassPoint(w.wind_dir_deg)} ` : "";
  const gust = w.wind_gust_kmh != null && mph(w.wind_gust_kmh) > speed ? ` gusting ${mph(w.wind_gust_kmh)}` : "";
  return `wind ${from}${speed} mph${gust}`;
}

/** "79°F, Thunderstorms, wind S 15 mph gusting 25" — what the station reported. */
export function weatherText(w: WeatherReading): string {
  return [w.temp_c != null ? fahrenheit(w.temp_c) : "", w.conditions, windText(w)].filter(Boolean).join(", ");
}

/** Why there's no reading (WX-006); the service's own error isn't shown. */
const NO_READING: Record<Exclude<WeatherOutcome, "ok">, string> = {
  offline: "Not recorded — working offline",
  no_place: "Not available — no repeater or net control location set",
  error: "Not recorded — the weather service couldn't be reached",
  no_reading: "Not recorded — no nearby weather station reported",
};

/**
 * The weather lines for a summary, start first: the reading with its alerts,
 * or, as `missing`, why there's none.
 */
export function weatherLines(
  weather: ActivityWeather[]
): { label: string; text: string; alerts: string[]; missing: boolean }[] {
  return weather.map((w) => {
    const missing = w.outcome !== "ok";
    return {
      label: w.moment === "start" ? "Start" : "End",
      text: missing ? (NO_READING[w.outcome as Exclude<WeatherOutcome, "ok">] ?? "Not recorded") : weatherText(w),
      alerts: missing ? [] : w.alerts,
      missing,
    };
  });
}

/** Calls `onRecorded` when the weather for this activity comes in, to show it. */
export function useWeatherRecorded(activityId: string, onRecorded: () => void) {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let gone = false;
    listen<string>("activity-weather", (e) => {
      if (e.payload === activityId) onRecorded();
    })
      .then((u) => (gone ? u() : (unlisten = u)))
      .catch(() => {});
    return () => {
      gone = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);
}
