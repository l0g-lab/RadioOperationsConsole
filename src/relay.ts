/**
 * Relay station (docs/features/relay-station.md): messages received from one
 * station to pass on to another. What the records say for the ICS 309 and
 * ICS 214; the CSV is in export.ts.
 */
import type { Comms309Entry } from "./icsForms";
import type { Ics214Line, RelayMessage, RelayStatus, RelayStep } from "./types";

export function relayStatusLabel(s: RelayStatus): string {
  return s === "passed" ? "Passed" : s === "not_passed" ? "Not passed" : "Held";
}

/** The step that settled a message, if it's been passed or given up on. */
export function relayOutcome(m: RelayMessage): RelayStep | undefined {
  return [...m.steps].reverse().find((s) => s.kind !== "attempt");
}

const ms = (iso: string) => new Date(iso).getTime();

/**
 * The relay's communications for the ICS 309 (RELAY-041), oldest first: each
 * message as it came in to this station, each failed attempt to pass it on,
 * and its passing on. `me` is this station (the logging operator).
 */
export function relay309Entries(messages: RelayMessage[], me: string): Comms309Entry[] {
  const out: Comms309Entry[] = [];
  for (const m of messages) {
    if (!Number.isNaN(ms(m.received_at))) {
      out.push({ at: ms(m.received_at), from: m.from_station, to: me, message: m.message });
    }
    for (const s of m.steps) {
      if (Number.isNaN(ms(s.at))) continue;
      if (s.kind === "passed") {
        out.push({ at: ms(s.at), from: me, to: s.station, message: m.message });
      } else if (s.kind === "attempt") {
        const why = s.note ? `: ${s.note}` : "";
        out.push({ at: ms(s.at), from: me, to: s.station || m.for_station, message: `Unable to pass via ${s.via}${why}` });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Lines for the ICS 214 (RELAY-042): each message passed, each failed attempt,
 * and each given up on, within the period. Messages still held at the end are
 * left to the operator. Each line names the step it came from.
 */
export function relay214Lines(messages: RelayMessage[], from: string, to: string): Ics214Line[] {
  const a = ms(from);
  const b = ms(to);
  const lines: Ics214Line[] = [];
  for (const m of messages) {
    for (const s of m.steps) {
      const t = ms(s.at);
      if (Number.isNaN(t) || t < a || t > b) continue;
      const fromFor = `from ${m.from_station} for ${m.for_station}`;
      const to = s.station && s.station !== m.for_station ? ` to ${s.station}` : "";
      const text =
        s.kind === "passed"
          ? `Relayed message ${fromFor}${to} via ${s.via}`
          : s.kind === "attempt"
            ? `Unable to relay message ${fromFor}${to} via ${s.via}${s.note ? `: ${s.note}` : ""}`
            : `Message ${fromFor} not passed: ${s.note}`;
      lines.push({ at: new Date(t).toISOString(), text, source: `relay:${s.id}` });
    }
  }
  return lines;
}
