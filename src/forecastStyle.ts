/**
 * How an NWS forecast period is colored (Weather tab): by its conditions,
 * its temperature, its chance of rain, and its wind. Pure, so it's tested
 * apart from the tab. Colors themselves are theme tokens in styles.css.
 */

/** The conditions a period is shown as, most significant first. */
export type Condition = "storm" | "winter" | "rain" | "fog" | "cloudy" | "partly" | "clear" | "other";

const CONDITION_WORDS: [Condition, RegExp][] = [
  ["storm", /thunder|t-?storm/i],
  ["winter", /snow|sleet|freezing|ice|flurr|blizzard|wintry/i],
  ["rain", /rain|shower|drizzle/i],
  ["fog", /fog|haze|smoke|mist|dust/i],
  ["partly", /partly|mostly sunny|mostly clear/i],
  ["cloudy", /cloud|overcast/i],
  ["clear", /sunny|clear|fair/i],
];

/** The most significant condition named in the short forecast. */
export function conditionOf(shortForecast: string | undefined): Condition {
  if (!shortForecast) return "other";
  return CONDITION_WORDS.find(([, words]) => words.test(shortForecast))?.[0] ?? "other";
}

export type TempBand = "freezing" | "cold" | "mild" | "warm" | "hot" | "extreme";

/** Temperature on a cold-to-hot scale, in °F (Celsius is converted). */
export function tempBand(temperature: number, unit = "F"): TempBand {
  const f = unit.toUpperCase() === "C" ? (temperature * 9) / 5 + 32 : temperature;
  if (f <= 32) return "freezing";
  if (f <= 50) return "cold";
  if (f <= 70) return "mild";
  if (f <= 85) return "warm";
  if (f <= 95) return "hot";
  return "extreme";
}

export type PrecipLevel = "low" | "possible" | "likely" | "high";

/** Chance of precipitation: under 20% low, then 20/50/80% steps. */
export function precipLevel(percent: number): PrecipLevel {
  if (percent < 20) return "low";
  if (percent < 50) return "possible";
  if (percent < 80) return "likely";
  return "high";
}

export type WindLevel = "calm" | "strong" | "dangerous";

/** The highest speed in "10 to 15 mph" (or km/h, converted), graded. */
export function windLevel(windSpeed: string | undefined): WindLevel {
  if (!windSpeed) return "calm";
  const speeds = (windSpeed.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  if (speeds.length === 0) return "calm";
  const top = Math.max(...speeds);
  const mph = /km/i.test(windSpeed) ? top / 1.609 : top;
  if (mph >= 40) return "dangerous";
  if (mph >= 25) return "strong";
  return "calm";
}
