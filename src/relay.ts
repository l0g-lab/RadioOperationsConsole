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

/**
 * How a check-in's traffic is getting on, for its row (RELAY-051): "→ EOC
 * via RTTY", "Not passed", "1 failed attempt"; "" when there's nothing to add
 * to the Handled box.
 */
export function trafficProgress(m: RelayMessage): string {
  const outcome = relayOutcome(m);
  if (outcome?.kind === "not_passed") return "Not passed";
  if (outcome?.kind === "passed") {
    const parts = [outcome.station && `→ ${outcome.station}`, outcome.via && `via ${outcome.via}`].filter(Boolean);
    return parts.join(" ");
  }
  const tries = m.steps.filter((s) => s.kind === "attempt").length;
  return tries === 0 ? "" : tries === 1 ? "1 failed attempt" : `${tries} failed attempts`;
}

const ms = (iso: string) => new Date(iso).getTime();

/**
 * The relay's communications for the ICS 309 (RELAY-041), oldest first: each
 * message as it came in to this station, each failed attempt to pass it on,
 * its passing on (with how), and giving up on it. `me` is this station (the
 * logging operator).
 */
export function relay309Entries(messages: RelayMessage[], me: string): Comms309Entry[] {
  const out: Comms309Entry[] = [];
  for (const m of messages) {
    // A check-in's traffic came in with the check-in, whose line says so
    // (RELAY-052); only passing it on adds lines, and only to someone named.
    if (!m.checkin_id && !Number.isNaN(ms(m.received_at))) {
      out.push({ at: ms(m.received_at), from: m.from_station, to: me, message: m.message });
    }
    for (const s of m.steps) {
      if (Number.isNaN(ms(s.at))) continue;
      const why = s.note ? `: ${s.note}` : "";
      if (s.kind === "passed" && !s.station) continue;
      if (s.kind === "passed") {
        // How it went, since it often leaves another way than it came in.
        const via = s.via ? ` (via ${s.via})` : "";
        out.push({ at: ms(s.at), from: me, to: s.station, message: `${m.message}${via}`.trim() });
      } else if (s.kind === "attempt") {
        out.push({ at: ms(s.at), from: me, to: s.station || m.for_station, message: `Unable to pass via ${s.via}${why}` });
      } else {
        // Given up on: said, but sent to no one, so To is blank.
        const to = m.for_station ? ` to ${m.for_station}` : "";
        out.push({ at: ms(s.at), from: me, to: "", message: `Not passed${to}${why}` });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Lines for the ICS 214 (RELAY-042): each message passed, each failed attempt,
 * and each given up on, within the period. Messages still held at the end are
 * left to the operator. Each line names the step it came from; a check-in's
 * traffic passed on names its check-in, as when it was only marked handled.
 */
export function relay214Lines(messages: RelayMessage[], from: string, to: string): Ics214Line[] {
  const a = ms(from);
  const b = ms(to);
  const lines: Ics214Line[] = [];
  for (const m of messages) {
    const traffic = !!m.checkin_id;
    for (const s of m.steps) {
      const t = ms(s.at);
      if (Number.isNaN(t) || t < a || t > b) continue;
      const fromFor = `from ${m.from_station}${m.for_station ? ` for ${m.for_station}` : ""}`;
      const to = s.station && s.station !== m.for_station ? ` to ${s.station}` : "";
      const via = s.via ? ` via ${s.via}` : "";
      const note = s.note ? `: ${s.note}` : "";
      const text = traffic
        ? s.kind === "passed"
          ? `Handled traffic ${fromFor}${to}${via}${m.message ? `: ${m.message}` : ""}`
          : s.kind === "attempt"
            ? `Unable to pass traffic ${fromFor}${to}${via}${note}`
            : `Traffic ${fromFor} not passed${note}`
        : s.kind === "passed"
          ? `Relayed message ${fromFor}${to}${via}`
          : s.kind === "attempt"
            ? `Unable to relay message ${fromFor}${to}${via}${note}`
            : `Message ${fromFor} not passed${note}`;
      const source = traffic && s.kind === "passed" ? `traffic:${m.checkin_id}` : `relay:${s.id}`;
      lines.push({ at: new Date(t).toISOString(), text, source });
    }
  }
  return lines;
}
