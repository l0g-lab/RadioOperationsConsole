import { describe, expect, it } from "vitest";
import { bandOf, mhzFromText } from "./bands";

describe("bandOf (NETL-026)", () => {
  it("names amateur bands, grouped HF, VHF, UHF", () => {
    expect(bandOf(146.94)).toEqual({ label: "2m", group: "vhf" });
    expect(bandOf(444.9)).toEqual({ label: "70cm", group: "uhf" });
    expect(bandOf(3.94)).toEqual({ label: "80m", group: "hf" });
    expect(bandOf(28.4)).toEqual({ label: "10m", group: "hf" });
    expect(bandOf(50.125)).toEqual({ label: "6m", group: "vhf" });
  });

  it("names the personal radio services", () => {
    expect(bandOf(462.65)).toEqual({ label: "GMRS", group: "personal" });
    expect(bandOf(467.65)).toEqual({ label: "GMRS", group: "personal" });
    expect(bandOf(151.94)).toEqual({ label: "MURS", group: "personal" });
    expect(bandOf(27.185)).toEqual({ label: "CB", group: "personal" });
  });

  it("is null outside the bands or without a frequency", () => {
    expect(bandOf(100.1)).toBeNull();
    expect(bandOf(null)).toBeNull();
    expect(bandOf(Number.NaN)).toBeNull();
  });
});

describe("mhzFromText", () => {
  it("reads the first number of typed frequency text", () => {
    expect(mhzFromText("28.400 USB")).toBe(28.4);
    expect(mhzFromText("146.520 simplex")).toBe(146.52);
    expect(mhzFromText("Echolink")).toBeNull();
  });
});
