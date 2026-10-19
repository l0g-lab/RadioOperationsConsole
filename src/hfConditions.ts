/**
 * HF conditions (docs/features/hf-conditions.md): what NOAA's space weather
 * readings mean for a net, in a line or a few. The readings are fetched and
 * parsed by the backend (space_weather.rs).
 */
import type { HfAbsorption, HfConditions, HfOutlookDay } from "./types";

/** NOAA's word for each level of its scales. */
const WORDS = ["none", "minor", "moderate", "strong", "severe", "extreme"];

/** What each level means for HF, from NOAA's scale descriptions (HFC-003). */
const MEANING: Record<"R" | "S" | "G", string[]> = {
  R: [
    "",
    "weak HF fading on the sunlit side, with brief loss of contact",
    "HF fading on the sunlit side, with loss of contact for tens of minutes",
    "wide-area HF blackout on the sunlit side for about an hour",
    "HF blackout on most of the sunlit side for one to two hours",
    "complete HF blackout on the sunlit side for hours",
  ],
  S: [
    "",
    "minor HF effects through the polar regions",
    "small HF effects through the polar regions",
    "HF degraded through the polar regions",
    "HF blacked out through the polar regions",
    "HF completely blacked out in the polar regions",
  ],
  G: [
    "",
    "little effect on HF outside high latitudes",
    "HF fading at higher latitudes",
    "HF fading and intermittent, worse toward higher latitudes",
    "HF sporadic",
    "HF may be impossible in many areas for a day or two",
  ],
};

const NAMES = { R: "radio blackout", S: "solar radiation storm", G: "geomagnetic storm" };

/** Amber needs watching; red is a blackout or storm that will stop a net. */
export type HfLevel = "warning" | "danger";

export interface HfLine {
  text: string;
  level: HfLevel;
}

/** The K index rounded, as hams say it, with what it means (HFC-002). */
export function kText(kp: number): { k: number; meaning: string } {
  const k = Math.round(kp);
  return { k, meaning: k <= 2 ? "quiet" : k === 3 ? "unsettled" : k === 4 ? "active" : "storm" };
}

/** Each scale above 0 now, on a line of its own (HFC-003). */
export function scaleLines(c: Pick<HfConditions, "r" | "s" | "g">): HfLine[] {
  return (["R", "G", "S"] as const)
    .map((kind) => ({ kind, n: c[kind.toLowerCase() as "r" | "s" | "g"] }))
    .filter(({ n }) => n > 0)
    .map(({ kind, n }) => ({
      text: `${kind}${n} (${WORDS[n] ?? ""}) ${NAMES[kind]} — ${MEANING[kind][n] ?? ""}`,
      level: (kind === "R" && n >= 3) || (kind !== "R" && n >= 4) ? "danger" : "warning",
    }));
}

/** "today", or the day's name: "Mon". Dates are UTC, as NOAA gives them. */
function dayName(date: string, today: string): string {
  if (date === today) return "today";
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

/** The chance of an R3-or-worse blackout worth mentioning (HFC-005). */
const MAJOR_BLACKOUT_PCT = 10;

/**
 * What's expected in the days ahead, only when it matters (HFC-005): a storm
 * (G1 and up), or a real chance of a big blackout. Minor R1–R2 blackouts are
 * a near-daily chance at solar maximum and go unsaid. The same forecast on
 * several days is said once: "G1 (minor) storm expected Mon and Tue".
 */
export function outlookLine(days: HfOutlookDay[], today: string): HfLine | null {
  const said = new Map<string, string[]>();
  let worst: HfLevel = "warning";
  for (const d of days) {
    const parts: string[] = [];
    if (d.g > 0) {
      parts.push(`G${d.g} (${WORDS[d.g] ?? ""}) storm`);
      if (d.g >= 4) worst = "danger";
    }
    if ((d.r_major_pct ?? 0) >= MAJOR_BLACKOUT_PCT) parts.push(`${d.r_major_pct}% chance of an R3+ blackout`);
    if (parts.length === 0) continue;
    const key = parts.join(", ");
    said.set(key, [...(said.get(key) ?? []), dayName(d.date, today)]);
  }
  if (said.size === 0) return null;
  const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  return { text: `Outlook: ${[...said].map(([what, on]) => `${what} expected ${and(on)}`).join("; ")}`, level: worst };
}

const normal = (message: string) => !message.trim() || /^normal/i.test(message.trim());

/**
 * Absorption at the area, only while a flare or proton event is on (HFC-004):
 * HF's normal daytime absorption, a few MHz at noon, goes unsaid.
 */
export function absorptionLine(a: HfAbsorption | null): HfLine | null {
  if (!a || a.mhz <= 0 || (normal(a.xray) && normal(a.proton))) return null;
  const why = [a.xray, a.proton].filter((m) => !normal(m)).join("; ");
  const recovery = a.recovery && !/^no estimate$/i.test(a.recovery.trim()) ? ` Recovery expected in ${a.recovery}.` : "";
  return {
    text: `HF below ${Number(a.mhz.toFixed(1))} MHz weakened by absorption here — ${why}.${recovery}`,
    level: a.mhz >= 10 ? "danger" : "warning",
  };
}

/** Everything worth saying beyond the summary, most pressing first. */
export function hfLines(c: HfConditions, today = new Date().toISOString().slice(0, 10)): HfLine[] {
  return [...scaleLines(c), absorptionLine(c.absorption), outlookLine(c.outlook, today)].filter(
    (l): l is HfLine => l != null
  );
}

/** One reading on the summary line, with a word for what it means and a line on hovering (HFC-002). */
export interface HfFact {
  /** "Solar flux 137". */
  text: string;
  /** "good". */
  word: string;
  /** What the number tells an operator. */
  hint: string;
  /** When it was measured (RFC 3339). */
  at: string;
}

/** Solar flux: higher opens the upper HF bands. */
export function fluxWord(flux: number): string {
  return flux < 80 ? "poor" : flux < 110 ? "fair" : flux < 150 ? "good" : "excellent";
}

/** The A index: the day's average disturbance. */
export function aWord(a: number): string {
  return a < 8 ? "quiet" : a < 16 ? "unsettled" : a < 30 ? "active" : a < 50 ? "minor storm" : "major storm";
}

/** The readings it always shows: solar flux, K, and A, each with its meaning. */
export function hfFacts(c: HfConditions): HfFact[] {
  const facts: HfFact[] = [];
  if (c.flux != null) {
    facts.push({
      text: `Solar flux ${Math.round(c.flux)}`,
      word: fluxWord(c.flux),
      hint: "The sun's radio output. Higher opens the upper HF bands (10–20 m); under 80 they're mostly closed.",
      at: c.flux_at,
    });
  }
  if (c.kp != null) {
    const k = kText(c.kp);
    facts.push({
      text: `K ${k.k}`,
      word: k.meaning,
      hint: `Disturbance of the earth's magnetic field over the last 3 hours (Kp ${c.kp}). 0–2 is quiet; 5 and up is a storm, with HF fading.`,
      at: c.kp_at,
    });
  }
  if (c.a_index != null) {
    facts.push({
      text: `A ${Math.round(c.a_index)}`,
      word: aWord(c.a_index),
      hint: "The day's average disturbance. Under 8 is quiet; 30 and up is a storm.",
      at: "",
    });
  }
  return facts;
}

/** Nothing to say and nothing stirring: the summary can start "Quiet" (HFC-001). */
export function isQuiet(c: HfConditions, lines: HfLine[]): boolean {
  return lines.length === 0 && (c.kp == null || kText(c.kp).k <= 2) && (c.a_index == null || c.a_index < 8);
}
