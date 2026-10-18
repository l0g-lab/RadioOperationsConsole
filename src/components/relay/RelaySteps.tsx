import { useState, type ReactNode } from "react";
import * as api from "../../api";
import type { RelayMessage, RelayStep, RelayStepKind } from "../../types";
import { relayStatusLabel } from "../../relay";
import { formatContactTime, parseContactTime } from "../../utils";
import SuggestInput, { earlierEntries } from "../SuggestInput";

/**
 * Passing a message on (relay-station.md): the form for a step and the list
 * of steps taken, shared by a relay station's messages and a check-in's
 * traffic (RELAY-050).
 */

/** Other ways traffic gets passed, offered alongside the frequencies already used. */
export const OTHER_MEANS = ["Phone", "Winlink", "JS8Call", "RTTY", "PSK31", "FT8", "In person", "Runner"];

/** "14:05", with the date in front when it isn't today. */
export function when(iso: string): string {
  const full = formatContactTime(iso);
  if (!full) return iso;
  const today = formatContactTime(new Date()).slice(0, 10);
  return full.slice(0, 10) === today ? full.slice(11, 16) : full.slice(0, 16);
}

/** A typed time, or now when left blank. */
export function timeOrNow(text: string): string | null {
  if (!text.trim()) return new Date().toISOString();
  const t = parseContactTime(text);
  return t.kind === "ok" ? t.iso : null;
}

export const TIME_HINT = "YYYY-MM-DD HH:MM, or HH:MM for today. Blank for now.";

export function stepText(s: RelayStep): string {
  if (s.kind === "passed") {
    const to = s.station ? ` to ${s.station}` : "";
    const via = s.via ? ` via ${s.via}` : "";
    return to || via ? `Passed${to}${via}` : "Handled";
  }
  if (s.kind === "attempt") {
    return `Attempt failed via ${s.via}${s.station ? ` to ${s.station}` : ""}${s.note ? `: ${s.note}` : ""}`;
  }
  return `Not passed: ${s.note}`;
}

/** Saves on Enter in a one-line box. */
export const enterSaves = (save: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" && !e.nativeEvent.isComposing && (e.target as HTMLElement).tagName === "INPUT") {
    e.preventDefault();
    save();
  }
};

/** The ways and stations a session has used so far, to offer again. */
export function viaChoicesFrom(frequency: string, messages: RelayMessage[]): string[] {
  return Array.from(
    new Set(
      [frequency, ...messages.flatMap((m) => [m.received_via, ...m.steps.map((s) => s.via)]), ...OTHER_MEANS].filter(
        Boolean
      )
    )
  );
}

/**
 * Recording one step for a message: passed (to whom, how), a failed attempt
 * (how, who, what happened), or couldn't pass (why). Time defaults to now.
 */
export function StepForm({
  message,
  kind,
  stationChoices,
  viaChoices,
  operatorId,
  onSaved,
  onCancel,
}: {
  message: RelayMessage;
  kind: RelayStepKind;
  stationChoices: string[];
  viaChoices: string[];
  operatorId: string | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [at, setAt] = useState("");
  const [station, setStation] = useState(kind === "not_passed" ? "" : message.for_station);
  const [via, setVia] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const t = timeOrNow(at);
    if (!t) return setError(`"${at}" isn't a time. ${TIME_HINT}`);
    try {
      await api.addRelayStep(message.id, { kind, at: t, station, via, note }, operatorId);
    } catch (e) {
      return setError(String(e));
    }
    onSaved();
  }

  const title = kind === "passed" ? "Passed on" : kind === "attempt" ? "Attempt failed" : "Couldn't pass";
  return (
    <div
      className="relay-step-form"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        else enterSaves(save)(e);
      }}
    >
      <strong>{title}</strong>
      <div className="inline-form">
        <label>
          Time
          <input
            value={at}
            placeholder={formatContactTime(new Date()).slice(0, 16)}
            title={TIME_HINT}
            onChange={(e) => setAt(e.target.value)}
          />
        </label>
        {kind !== "not_passed" && (
          <>
            <label>
              {kind === "passed" ? "Passed to" : "Tried to reach"}
              <SuggestInput
                id="relay-step-station"
                listLabel="Stations"
                value={station}
                onChange={setStation}
                suggest={(t) => earlierEntries(t, stationChoices)}
                autoFocus
              />
            </label>
            <label>
              Via
              <SuggestInput
                id="relay-step-via"
                listLabel="Ways passed"
                value={via}
                placeholder="Frequency, phone, JS8Call…"
                onChange={setVia}
                suggest={(t) => earlierEntries(t, viaChoices)}
              />
            </label>
          </>
        )}
        {kind !== "passed" && (
          <label className="relay-step-note">
            {kind === "attempt" ? "What happened (optional)" : "Why"}
            <input
              value={note}
              placeholder={kind === "attempt" ? "e.g. No contact" : "e.g. EOC closed; no path"}
              onChange={(e) => setNote(e.target.value)}
              autoFocus={kind === "not_passed"}
            />
          </label>
        )}
      </div>
      <div className="inline-form">
        <button className="primary" onClick={save}>
          Save
        </button>
        <button onClick={onCancel}>Cancel</button>
        {error && (
          <span className="weather-area-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

/** The steps taken so far, oldest first, each undoable (RELAY-023). */
export function StepList({ steps, onUndo }: { steps: RelayStep[]; onUndo: (s: RelayStep) => void }) {
  if (steps.length === 0) return null;
  return (
    <ul className="relay-steps">
      {steps.map((s) => (
        <li key={s.id}>
          <span className="relay-time">{when(s.at)}</span> {stepText(s)}
          <button className="link-button" onClick={() => onUndo(s)} title="Take back a step recorded by mistake">
            Undo
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The buttons for a message still held: what happened when passing it on. */
export function HeldActions({ onStep }: { onStep: (kind: RelayStepKind) => void }) {
  return (
    <>
      <button className="primary" onClick={() => onStep("passed")}>
        Passed…
      </button>
      <button onClick={() => onStep("attempt")}>Attempt failed…</button>
      <button onClick={() => onStep("not_passed")}>Couldn't pass…</button>
    </>
  );
}

/**
 * A message as a card: who it's from (`title`), how it came in, its status,
 * the text, and the steps taken; whatever else the screen adds below.
 */
export function MessageCard({
  message: m,
  title,
  extra,
  empty,
  className = "",
  onUndo,
  children,
}: {
  message: RelayMessage;
  title: ReactNode;
  /** More for the heading, after how it came in. */
  extra?: ReactNode;
  /** Shown when the message has no text. */
  empty?: ReactNode;
  className?: string;
  onUndo: (s: RelayStep) => void;
  children?: ReactNode;
}) {
  return (
    <div className={`relay-message relay-message-${m.status} ${className}`.trim()}>
      <div className="relay-message-head">
        {title}
        {m.received_via && <span className="settings-hint">on {m.received_via}</span>}
        {extra}
        <span className={`relay-status relay-status-${m.status}`}>{relayStatusLabel(m.status)}</span>
      </div>
      <div className="relay-message-text">{m.message || empty}</div>
      <StepList steps={m.steps} onUndo={onUndo} />
      {children}
    </div>
  );
}
