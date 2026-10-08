import { describe, expect, it } from "vitest";
import { reportSummary } from "./NetRows";

describe("reportSummary (SPOT-024)", () => {
  it("names each hazard once, with how many when more than one", () => {
    expect(reportSummary([])).toBe("");
    expect(reportSummary(["Hail", "Wind Damage", "Hail"])).toBe("Hail ×2, Wind Damage");
  });
});
