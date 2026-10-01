import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Checkin, ContactDetails, StationHistory } from "../../types";
import { formatContactTime, formatTimeLines, parseContactTime } from "../../utils";
import { hintWidth } from "../hintWidth";

/** A contact's radio details as typed (station logs). Every field is optional. */
export interface ContactDraft {
  /** Typed local time ("YYYY-MM-DD HH:MM" or "HH:MM"); blank means "now" when logging. */
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
    ? `"${d.at.trim()}" isn't a time. Use YYYY-MM-DD HH:MM, or HH:MM for today — or leave it blank for now.`
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

const MODES = ["FM", "SSB", "USB", "LSB", "AM", "CW", "DMR", "D-STAR", "C4FM", "FT8", "Packet"];

const TIME_HINT = "Now, or YYYY-MM-DD HH:MM";

/** The contact-detail inputs, used both when logging and when correcting a contact. */
export function ContactFieldsInputs({
  value,
  onChange,
  onEnter,
  frequencyPlaceholder,
  idPrefix,
  saveAttempted = false,
}: {
  value: ContactDraft;
  onChange: (d: ContactDraft) => void;
  onEnter: () => void;
  /** Shown when the frequency is blank, e.g. the activity's own frequency. */
  frequencyPlaceholder?: string;
  idPrefix: string;
  /** A save was refused (bad time): show why even if the time box still has focus. */
  saveAttempted?: boolean;
}) {
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
          title: "When the contact was made, in this computer's time. Leave blank for now.",
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
      {field("mode", "Mode", "Mode", 8, { list: `${idPrefix}-modes` })}
      <datalist id={`${idPrefix}-modes`}>
        {MODES.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
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
