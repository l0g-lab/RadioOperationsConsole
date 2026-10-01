import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Checkin, ContactDetails, StationHistory } from "../../types";
import { formatContactTime, formatTimeLines, parseContactTime } from "../../utils";
import { hintWidth } from "../hintWidth";

/** A contact's radio details as typed (station logs). Every field is optional. */
export interface ContactDraft {
  /** Typed local time ("YYYY-MM-DD HH:MM[:SS]" or "HH:MM"); blank means "now" when logging. */
  at: string;
  frequency: string;
  mode: string;
  rstSent: string;
  rstReceived: string;
  power: string;
  antenna: string;
  notes: string;
}

export const EMPTY_CONTACT: ContactDraft = {
  at: "",
  frequency: "",
  mode: "",
  rstSent: "",
  rstReceived: "",
  power: "",
  antenna: "",
  notes: "",
};

/**
 * What carries over to the next contact: the station setup rarely changes
 * between contacts, the time, reports and notes always do.
 */
export function nextContact(d: ContactDraft): ContactDraft {
  return {
    ...EMPTY_CONTACT,
    frequency: d.frequency,
    mode: d.mode,
    power: d.power,
    antenna: d.antenna,
  };
}

export function draftFromCheckin(c: Checkin): ContactDraft {
  return {
    at: formatContactTime(c.checked_in_at),
    frequency: c.frequency,
    mode: c.mode,
    rstSent: c.rst_sent,
    rstReceived: c.rst_received,
    power: c.power,
    antenna: c.antenna,
    notes: c.notes,
  };
}

/** Why the typed time can't be used, or null if it's fine (or blank). */
export function contactTimeError(d: ContactDraft): string | null {
  return parseContactTime(d.at).kind === "invalid"
    ? `"${d.at.trim()}" isn't a time. Use YYYY-MM-DD HH:MM (seconds optional), or HH:MM for today — or leave it blank for now.`
    : null;
}

/** The draft as the backend takes it; a blank time is left out (check `contactTimeError` first). */
export function toContactDetails(d: ContactDraft): ContactDetails {
  const t = (s: string) => s.trim() || null;
  const at = parseContactTime(d.at);
  return {
    contacted_at: at.kind === "ok" ? at.iso : null,
    frequency: t(d.frequency),
    mode: t(d.mode),
    rst_sent: t(d.rstSent),
    rst_received: t(d.rstReceived),
    power: t(d.power),
    antenna: t(d.antenna),
    notes: t(d.notes),
  };
}

/** Whether a record has any contact details (so they're shown even outside a log). */
export function hasContactDetails(c: Checkin): boolean {
  return [c.frequency, c.mode, c.rst_sent, c.rst_received, c.power, c.antenna, c.notes].some(
    (v) => v.trim() !== "",
  );
}

/** "59 / 57" — sent then received, either side may be missing. */
export function rstPair(c: Pick<Checkin, "rst_sent" | "rst_received">): string {
  if (!c.rst_sent && !c.rst_received) return "";
  return `${c.rst_sent || "–"} / ${c.rst_received || "–"}`;
}

export const MODES = ["FM", "SSB", "USB", "LSB", "AM", "CW", "DMR", "D-STAR", "C4FM", "FT8", "Packet"];

/** Modes starting with what's typed (ignoring case); nothing for an empty box or an exact match. */
export function modeSuggestions(typed: string): string[] {
  const t = typed.trim().toLowerCase();
  if (!t) return [];
  const matches = MODES.filter((m) => m.toLowerCase().startsWith(t));
  return matches.length === 1 && matches[0].toLowerCase() === t ? [] : matches;
}

/**
 * The mode box: free text, with common modes suggested as you type. The
 * webview's own suggestion list (a datalist) can't be accepted with Tab, so
 * this is a small one of our own: the first match is highlighted, Tab takes
 * it and moves on as Tab normally does, Enter takes it (a second Enter then
 * saves), arrows move the highlight, Escape closes the list.
 */
function ModeInput({
  value,
  onChange,
  onEnter,
  idPrefix,
}: {
  value: string;
  onChange: (mode: string) => void;
  onEnter: () => void;
  idPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = open ? modeSuggestions(value) : [];
  const shown = suggestions.length > 0;
  const listId = `${idPrefix}-modes`;
  const optionId = (i: number) => `${listId}-${i}`;

  function take(mode: string) {
    onChange(mode);
    setOpen(false);
  }

  return (
    <span className="mode-input">
      <input
        role="combobox"
        aria-label="Mode"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown ? optionId(active) : undefined}
        placeholder="Mode"
        className="contact-field contact-field-mode"
        style={hintWidth("Mode", { minChars: 8 })}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (shown && e.key === "Tab" && !e.shiftKey) {
            // Not prevented: focus still moves on to the next field.
            take(suggestions[active]);
          } else if (shown && e.key === "Enter") {
            e.preventDefault();
            take(suggestions[active]);
          } else if (shown && e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % suggestions.length);
          } else if (shown && e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
          } else if (shown && e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          } else if (e.key === "Enter") {
            onEnter();
          }
        }}
      />
      {shown && (
        <ul id={listId} role="listbox" aria-label="Modes" className="mode-suggestions">
          {suggestions.map((m, i) => (
            <li
              key={m}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : undefined}
              // Before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                take(m);
              }}
            >
              {m}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

/** The time box's hint when it isn't showing the running clock; also sizes the box. */
const TIME_HINT = "YYYY-MM-DD HH:MM:SS";

/** The current time, updated every second while `running`. */
function useClock(running: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!running) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [running]);
  return now;
}

/** The contact-detail inputs, used both when logging and when correcting a contact. */
export function ContactFieldsInputs({
  value,
  onChange,
  onEnter,
  frequencyPlaceholder,
  idPrefix,
  saveAttempted = false,
  liveTime = false,
}: {
  value: ContactDraft;
  onChange: (d: ContactDraft) => void;
  onEnter: () => void;
  /** Shown when the frequency is blank, e.g. the activity's own frequency. */
  frequencyPlaceholder?: string;
  idPrefix: string;
  /** A save was refused (bad time): show why even if the time box still has focus. */
  saveAttempted?: boolean;
  /**
   * Logging a new contact: the empty time box shows the current time,
   * running, since that's what a blank time logs. Not when correcting one,
   * where blank means "keep its time".
   */
  liveTime?: boolean;
}) {
  const now = useClock(liveTime && !value.at);
  // A half-typed time ("10:") isn't an error yet: say so once the operator
  // leaves the box or tries to save.
  const [timeLeft, setTimeLeft] = useState(false);
  const field = (
    key: keyof ContactDraft,
    label: string,
    hint = label,
    minChars = 0,
    extra = {}
  ) => (
    <input
      aria-label={label}
      placeholder={hint}
      className={`contact-field contact-field-${key}`}
      style={hintWidth(hint, { minChars })}
      value={value[key]}
      onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      onKeyDown={(e) => {
        if (e.key === "Enter") onEnter();
      }}
      {...extra}
    />
  );
  const timeError = timeLeft || saveAttempted ? contactTimeError(value) : null;
  return (
    <div className="contact-fields">
      <label className="contact-field-time">
        <span>Time</span>
        {field("at", "Contact time", TIME_HINT, 0, {
          ...(liveTime ? { placeholder: formatContactTime(now) } : {}),
          title: liveTime
            ? "When the contact was made, in this computer's time. Leave blank to log the time shown, the moment you save."
            : "When the contact was made, in this computer's time: YYYY-MM-DD HH:MM, seconds optional.",
          "aria-invalid": timeError != null,
          onFocus: () => setTimeLeft(false),
          onBlur: () => setTimeLeft(true),
        })}
      </label>
      {field(
        "frequency",
        "Frequency",
        frequencyPlaceholder ? `Frequency (${frequencyPlaceholder})` : "Frequency"
      )}
      <ModeInput
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
        onEnter={onEnter}
        idPrefix={idPrefix}
      />
      {field("rstSent", "RST sent")}
      {field("rstReceived", "RST received")}
      {field("power", "Power", "Power", 8)}
      {field("antenna", "Antenna", "Antenna", 16)}
      {field("notes", "Notes", "Notes (anything worth remembering)")}
      {timeError && (
        <p className="weather-area-error contact-time-error" role="alert">
          {timeError}
        </p>
      )}
    </div>
  );
}

const HISTORY_DEBOUNCE_MS = 500;
const HISTORY_MIN_LENGTH = 3;

/** Earlier records of the call sign being typed, looked up after a pause. */
export function useStationHistory(callSign: string): StationHistory | null {
  const [history, setHistory] = useState<StationHistory | null>(null);
  useEffect(() => {
    const call = callSign.trim();
    setHistory(null);
    if (call.length < HISTORY_MIN_LENGTH) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .stationHistory(call)
        .then((h) => {
          if (!cancelled) setHistory(h);
        })
        .catch(() => {});
    }, HISTORY_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [callSign]);
  return history;
}

/** "Worked before: 3 times — last …" for a call sign, or nothing if it's new. */
export function WorkedBefore({
  history,
  label = "Worked before",
}: {
  history: StationHistory | null;
  label?: string;
}) {
  if (!history || history.count === 0 || !history.last) return null;
  const { last } = history;
  const when = formatTimeLines(last.at)
    .local.replace(/^Local: /, "")
    .slice(0, 16);
  const who = [last.name, last.qth_location].filter(Boolean).join(", ");
  return (
    <p className="settings-hint checkin-entry-hint worked-before" role="status">
      <strong>{label}:</strong> {history.count} {history.count === 1 ? "time" : "times"} — last{" "}
      {when} in “{last.activity_title}”{last.frequency ? ` on ${last.frequency}` : ""}
      {who ? ` · ${who}` : ""}
    </p>
  );
}
