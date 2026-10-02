import { describe, expect, it } from "vitest";
import { formatMhz, formatRepeater, inputMhz } from "./repeaters";
import type { Repeater } from "./types";

function repeater(overrides: Partial<Repeater> = {}): Repeater {
  return {
    id: "r1",
    name: "W4ABC Orlando",
    output_mhz: 146.94,
    offset_mhz: -0.6,
    tone_in_kind: "pl",
    tone_in: "100.0",
    tone_out_kind: "pl",
    tone_out: "100.0",
    mode: "FM",
    location_label: "",
    location_lat: null,
    location_lon: null,
    notes: "Linked to the county system",
    retired_at: "",
    ...overrides,
  };
}

describe("formatRepeater (RPT-005)", () => {
  it("shows output, offset and input tone on one line", () => {
    expect(formatRepeater(repeater())).toBe("146.940 -0.600 PL 100.0");
    expect(
      formatRepeater(
        repeater({ output_mhz: 444.5, offset_mhz: 5, tone_in_kind: "dcs", tone_in: "023N", tone_out_kind: "none", tone_out: "" })
      )
    ).toBe("444.500 +5.000 DCS 023N");
    expect(formatRepeater(repeater({ output_mhz: 146.52, offset_mhz: 0, tone_in_kind: "none", tone_in: "", tone_out_kind: "none", tone_out: "" }))).toBe(
      "146.520 simplex"
    );
  });

  it("adds the output tone only when it differs, and a mode other than FM", () => {
    expect(formatRepeater(repeater({ tone_out: "123.0" }))).toBe("146.940 -0.600 PL 100.0 / out PL 123.0");
    expect(formatRepeater(repeater({ tone_in_kind: "none", tone_in: "" }))).toBe("146.940 -0.600 out PL 100.0");
    expect(formatRepeater(repeater({ mode: "DMR" }))).toBe("146.940 -0.600 PL 100.0 DMR");
  });

  it("keeps a fourth decimal only when it matters", () => {
    expect(formatMhz(145.2725)).toBe("145.2725");
    expect(formatMhz(146.94)).toBe("146.940");
  });
});

describe("offsets (RPT-002)", () => {
  it("works out the input frequency", () => {
    expect(inputMhz(repeater())).toBe(146.34);
  });
});

