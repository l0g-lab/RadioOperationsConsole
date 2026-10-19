import { describe, expect, it } from "vitest";
import { absorptionLine, aWord, fluxWord, hfFacts, hfLines, isQuiet, kText, outlookLine, scaleLines } from "./hfConditions";
import type { HfConditions } from "./types";

/** 2026-10-18 as NOAA had it: quiet now, a G1 storm forecast for the next two days. */
const quietDay = (o: Partial<HfConditions> = {}): HfConditions => ({
  flux: 137,
  flux_at: "2026-10-18T20:00:00+00:00",
  kp: 1.67,
  a_index: 6,
  kp_at: "2026-10-18T18:00:00+00:00",
  r: 0,
  s: 0,
  g: 0,
  scales_at: "2026-10-18T23:44:00+00:00",
  outlook: [
    { date: "2026-10-18", g: 0, r_minor_pct: 25, r_major_pct: 5 },
    { date: "2026-10-19", g: 0, r_minor_pct: 25, r_major_pct: 5 },
    { date: "2026-10-20", g: 0, r_minor_pct: 25, r_major_pct: 5 },
  ],
  absorption: {
    mhz: 0,
    valid_at: "2026-10-18T23:43:00+00:00",
    xray: "Normal X-ray Background",
    proton: "Normal Proton Background",
    recovery: "No Estimate",
  },
  ...o,
});
const TODAY = "2026-10-18";

describe("HF conditions (hf-conditions.md)", () => {
  it("is one line on a quiet day (HFC-001)", () => {
    const c = quietDay();
    expect(hfLines(c, TODAY)).toEqual([]);
    expect(hfFacts(c).map((f) => `${f.text} ${f.word}`)).toEqual(["Solar flux 137 good", "K 2 quiet", "A 6 quiet"]);
    expect(isQuiet(c, [])).toBe(true);
    // Unsettled with no storm declared isn't quiet, whatever else is.
    expect(isQuiet(quietDay({ a_index: 20 }), [])).toBe(false);
    expect(isQuiet(quietDay({ kp: 3 }), [])).toBe(false);
  });

  it("says what each reading means (HFC-002)", () => {
    expect([65, 80, 110, 150].map(fluxWord)).toEqual(["poor", "fair", "good", "excellent"]);
    expect([1.67, 3, 4.33, 5.67].map((k) => kText(k).meaning)).toEqual(["quiet", "unsettled", "active", "storm"]);
    expect([7, 8, 16, 30, 50].map(aWord)).toEqual(["quiet", "unsettled", "active", "minor storm", "major storm"]);
  });

  it("puts each scale above 0 on its own line, red once it will stop a net (HFC-003)", () => {
    expect(scaleLines({ r: 2, s: 0, g: 3 })).toEqual([
      {
        text: "R2 (moderate) radio blackout — HF fading on the sunlit side, with loss of contact for tens of minutes",
        level: "warning",
      },
      { text: "G3 (strong) geomagnetic storm — HF fading and intermittent, worse toward higher latitudes", level: "warning" },
    ]);
    expect(scaleLines({ r: 3, s: 0, g: 4 }).map((l) => l.level)).toEqual(["danger", "danger"]);
  });

  it("names absorption here only while a flare or proton event is on (HFC-004)", () => {
    // Normal daytime absorption isn't news.
    const daytime = { ...quietDay().absorption!, mhz: 3.5 };
    expect(absorptionLine(daytime)).toBeNull();
    const flare = { ...daytime, mhz: 9, xray: "R2 (Moderate) Radio Blackout in progress", recovery: "45 minutes" };
    expect(absorptionLine(flare)).toEqual({
      text: "HF below 9 MHz weakened by absorption here — R2 (Moderate) Radio Blackout in progress. Recovery expected in 45 minutes.",
      level: "warning",
    });
    expect(absorptionLine({ ...flare, mhz: 0 })).toBeNull();
    expect(absorptionLine(null)).toBeNull();
  });

  it("forecasts storms and big blackouts, not the daily chance of minor ones (HFC-005)", () => {
    const outlook = [
      { date: "2026-10-18", g: 0, r_minor_pct: 25, r_major_pct: 5 },
      { date: "2026-10-19", g: 1, r_minor_pct: 25, r_major_pct: 5 },
      { date: "2026-10-20", g: 1, r_minor_pct: 25, r_major_pct: 10 },
    ];
    expect(outlookLine(outlook, TODAY)).toEqual({
      text: "Outlook: G1 (minor) storm expected Mon; G1 (minor) storm, 10% chance of an R3+ blackout expected Tue",
      level: "warning",
    });
    const sameTwice = outlook.map((d) => ({ ...d, r_major_pct: 5, g: d.date === TODAY ? 0 : 1 }));
    expect(outlookLine(sameTwice, TODAY)?.text).toBe("Outlook: G1 (minor) storm expected Mon and Tue");
    expect(outlookLine([{ date: TODAY, g: 4, r_minor_pct: null, r_major_pct: null }], TODAY)).toEqual({
      text: "Outlook: G4 (severe) storm expected today",
      level: "danger",
    });
  });

  it("puts what's happening now ahead of the outlook", () => {
    const c = quietDay({
      r: 2,
      outlook: [{ date: "2026-10-19", g: 1, r_minor_pct: 50, r_major_pct: 5 }],
      absorption: { ...quietDay().absorption!, mhz: 9, xray: "R2 (Moderate) Radio Blackout in progress" },
    });
    expect(hfLines(c, TODAY).map((l) => l.text.slice(0, 12))).toEqual(["R2 (moderate", "HF below 9 M", "Outlook: G1 "]);
  });
});
