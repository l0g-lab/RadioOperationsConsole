import { describe, expect, it } from "vitest";
import { conditionOf, precipLevel, tempBand, windLevel } from "./forecastStyle";

describe("conditionOf", () => {
  it("picks the most significant condition named", () => {
    expect(conditionOf("Chance Showers And Thunderstorms")).toBe("storm");
    expect(conditionOf("Slight Chance T-storms")).toBe("storm");
    expect(conditionOf("Rain And Snow Likely")).toBe("winter");
    expect(conditionOf("Freezing Drizzle")).toBe("winter");
    expect(conditionOf("Partly Sunny then Slight Chance Rain Showers")).toBe("rain");
    expect(conditionOf("Patchy Fog")).toBe("fog");
    expect(conditionOf("Mostly Cloudy")).toBe("cloudy");
    expect(conditionOf("Partly Cloudy")).toBe("partly");
    expect(conditionOf("Mostly Sunny")).toBe("partly");
    expect(conditionOf("Sunny")).toBe("clear");
    expect(conditionOf("Clear")).toBe("clear");
    expect(conditionOf("Breezy")).toBe("other");
    expect(conditionOf(undefined)).toBe("other");
  });
});

describe("tempBand", () => {
  it("grades Fahrenheit and converts Celsius", () => {
    expect(tempBand(28)).toBe("freezing");
    expect(tempBand(45)).toBe("cold");
    expect(tempBand(68)).toBe("mild");
    expect(tempBand(84)).toBe("warm");
    expect(tempBand(93)).toBe("hot");
    expect(tempBand(101)).toBe("extreme");
    expect(tempBand(-2, "C")).toBe("freezing");
    expect(tempBand(28, "C")).toBe("warm"); // 82 °F
    expect(tempBand(30, "C")).toBe("hot"); // 86 °F
  });
});

describe("precipLevel", () => {
  it("steps at 20, 50 and 80 percent", () => {
    expect([10, 20, 49, 50, 79, 80].map(precipLevel)).toEqual([
      "low",
      "possible",
      "possible",
      "likely",
      "likely",
      "high",
    ]);
  });
});

describe("windLevel", () => {
  it("grades the highest speed given", () => {
    expect(windLevel("5 mph")).toBe("calm");
    expect(windLevel("10 to 25 mph")).toBe("strong");
    expect(windLevel("35 to 45 mph")).toBe("dangerous");
    expect(windLevel("50 km/h")).toBe("strong");
    expect(windLevel(undefined)).toBe("calm");
  });
});
