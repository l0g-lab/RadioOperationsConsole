import { describe, expect, it } from "vitest";
import { offerText } from "./CheckinEditRow";

const record = {
  call_sign: "W4ABC",
  name: "Pat Smith",
  qth_location: "Orlando, FL",
  grid_square: "EL98",
  address: null,
  exact_lat: null,
  exact_lon: null,
  geoloc: null,
};

describe("offerText", () => {
  it("says who a corrected call sign belongs to", () => {
    expect(offerText("w4abc", record)).toBe("W4ABC is Pat Smith, Orlando, FL");
    expect(offerText("W4ABC", { ...record, name: null, qth_location: null })).toBe("W4ABC is on file");
  });
});
