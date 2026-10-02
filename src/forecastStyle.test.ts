import { describe, expect, it } from "vitest";
import { conditionOf, windLevel } from "./forecastStyle";

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

describe("windLevel", () => {
  it("grades the highest speed given", () => {
    expect(windLevel("5 mph")).toBe("calm");
    expect(windLevel("10 to 25 mph")).toBe("strong");
    expect(windLevel("35 to 45 mph")).toBe("dangerous");
    expect(windLevel("50 km/h")).toBe("strong");
    expect(windLevel(undefined)).toBe("calm");
  });
});
