import { useEffect, useRef, useState } from "react";
import * as api from "../../api";
import type { Activity, RelayMessage, RelayStep, RelayStepKind } from "../../types";
import { relayStatusLabel } from "../../relay";
import { formatContactTime, parseContactTime } from "../../utils";
import { RemoveConfirmBar, RemovedPanel } from "../RemoveControls";
import { Send } from "lucide-react";
import SortToggle from "../SortToggle";
import { sortByTime, useSortOrder } from "../../hooks/useSortOrder";

/** Other ways traffic gets passed, offered alongside the frequencies already used. */
const OTHER_MEANS = ["Phone", "Winlink", "In person", "Runner"];

/** "14:05", with the date in front when it isn't today. */
function when(iso: string): string {
  const full = formatContactTime(iso);
  if (!full) return iso;
  const today = formatContactTime(new Date()).slice(0, 10);
  return full.slice(0, 10) === today ? full.slice(11, 16) : full.slice(0, 16);
}

/** A typed time, or now when left blank. */
function timeOrNow(text: string): string | null {
  if (!text.trim()) return new Date().toISOString();
  const t = parseContactTime(text);
  return t.kind === "ok" ? t.iso : null;
}

const TIME_HINT = "YYYY-MM-DD HH:MM, or HH:MM for today. Blank for now.";

function stepText(s: RelayStep): string {
  if (s.kind === "passed") return `Passed to ${s.station} via ${s.via}`;
  if (s.kind === "attempt") {
    return `Attempt failed via ${s.via}${s.station ? ` to ${s.station}` : ""}${s.note ? `: ${s.note}` : ""}`;
  }
  return `Not passed: ${s.note}`;
}

interface Draft {
  at: string;
  from: string;
  for: string;
  via: string;
  message: string;
  replyTo: RelayMessage | null;
}

interface StepDraft {
  messageId: string;
  kind: RelayStepKind;
  at: string;
  station: string;
  via: string;
  note: string;
}

/**
 * A relay station's working screen (relay-station.md): log each message as it
 * comes in, see what's still to pass, and record passing it on, failed
 * attempts, or giving up. Shown on the Check-ins tab for a relay activity.
 */
export default function RelayWorkspace({
  activity,
  operatorId,
  readOnly,
}: {
  activity: Activity;
  operatorId: string | null;
  readOnly: boolean;
}) {
  const blankDraft = (): Draft => ({
    at: "",
    from: "",
    for: "",
    via: activity.frequency,
    message: "",
    replyTo: null,
  });
  const [messages, setMessages] = useState<RelayMessage[]>([]);
  const [removed, setRemoved] = useState<RelayMessage[]>([]);
  const [showRemoved, setShowRemoved] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState<StepDraft | null>(null);
  const [removing, setRemoving] = useState<{ id: string; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const fromRef = useRef<HTMLInputElement>(null);

  function refresh() {
    api.listRelayMessages(activity.id).then(setMessages).catch(() => setMessages([]));
    api.listRemovedRelayMessages(activity.id).then(setRemoved).catch(() => setRemoved([]));
  }

  useEffect(() => {
    refresh();
    setDraft(blankDraft());
    setEditingId(null);
    setStep(null);
    setRemoving(null);
    setError(null);
  }, [activity.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = new Map(messages.map((m) => [m.id, m]));
  // One order for both lists, by when each message came in.
  const [order, toggleOrder] = useSortOrder("relay-messages", "oldest");
  const sorted = sortByTime(messages, (m) => m.received_at, order);
  const held = sorted.filter((m) => m.status === "held");
  const done = sorted.filter((m) => m.status !== "held");
  const viaChoices = Array.from(
    new Set(
      [
        activity.frequency,
        ...messages.flatMap((m) => [m.received_via, ...m.steps.map((s) => s.via)]),
        ...OTHER_MEANS,
      ].filter(Boolean)
    )
  );

  async function saveMessage() {
    const at = timeOrNow(draft.at);
    if (!at) return setError(`"${draft.at}" isn't a time. ${TIME_HINT}`);
    const input = {
      received_at: at,
      from_station: draft.from,
      for_station: draft.for,
      message: draft.message,
      received_via: draft.via,
      reply_to: draft.replyTo?.id ?? null,
    };
    try {
      if (editingId) await api.updateRelayMessage(editingId, input, operatorId);
      else await api.createRelayMessage(activity.id, input, operatorId);
    } catch (e) {
      return setError(String(e));
    }
    setError(null);
    setEditingId(null);
    // Keep how it came in: the next message usually arrives the same way.
    setDraft({ ...blankDraft(), via: draft.via });
    refresh();
    fromRef.current?.focus();
  }

  function edit(m: RelayMessage) {
    setEditingId(m.id);
    setDraft({
      at: formatContactTime(m.received_at),
      from: m.from_station,
      for: m.for_station,
      via: m.received_via,
      message: m.message,
      replyTo: m.reply_to ? (byId.get(m.reply_to) ?? null) : null,
    });
    setError(null);
    fromRef.current?.focus();
  }

  function reply(m: RelayMessage) {
    setEditingId(null);
    setDraft({
      ...blankDraft(),
      from: m.for_station,
      for: m.from_station,
      via: m.steps.find((s) => s.kind === "passed")?.via || activity.frequency,
      replyTo: m,
    });
    setError(null);
    fromRef.current?.focus();
  }

  function cancelDraft() {
    setEditingId(null);
    setDraft(blankDraft());
    setError(null);
  }

  function openStep(m: RelayMessage, kind: RelayStepKind) {
    setStep({ messageId: m.id, kind, at: "", station: kind === "not_passed" ? "" : m.for_station, via: "", note: "" });
    setStepError(null);
  }

  async function saveStep() {
    if (!step) return;
    const at = timeOrNow(step.at);
    if (!at) return setStepError(`"${step.at}" isn't a time. ${TIME_HINT}`);
    try {
      await api.addRelayStep(
        step.messageId,
        { kind: step.kind, at, station: step.station, via: step.via, note: step.note },
        operatorId
      );
    } catch (e) {
      return setStepError(String(e));
    }
    setStep(null);
    setStepError(null);
    refresh();
  }

  async function undo(s: RelayStep) {
    try {
      await api.undoRelayStep(s.id, operatorId);
    } catch (e) {
      setError(String(e));
    }
    refresh();
  }

  async function confirmRemove() {
    if (!removing) return;
    try {
      await api.voidRelayMessage(removing.id, removing.reason.trim() || null, operatorId);
    } catch (e) {
      setError(String(e));
    }
    if (editingId === removing.id) cancelDraft();
    setRemoving(null);
    refresh();
  }

  async function restore(id: string) {
    try {
      await api.restoreRelayMessage(id, operatorId);
    } catch (e) {
      setError(String(e));
    }
    refresh();
  }

  const enterSaves = (save: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing && (e.target as HTMLElement).tagName === "INPUT") {
      e.preventDefault();
      save();
    }
  };

  function stepForm(m: RelayMessage) {
    if (!step || step.messageId !== m.id) return null;
    const set = (k: keyof StepDraft, v: string) => setStep({ ...step, [k]: v });
    const title =
      step.kind === "passed" ? "Passed on" : step.kind === "attempt" ? "Attempt failed" : "Couldn't pass";
    return (
      <div className="relay-step-form" onKeyDown={enterSaves(saveStep)}>
        <strong>{title}</strong>
        <div className="inline-form">
          <label>
            Time
            <input
              value={step.at}
              placeholder={formatContactTime(new Date()).slice(0, 16)}
              title={TIME_HINT}
              onChange={(e) => set("at", e.target.value)}
            />
          </label>
          {step.kind !== "not_passed" && (
            <>
              <label>
                {step.kind === "passed" ? "Passed to" : "Tried to reach"}
                <input value={step.station} onChange={(e) => set("station", e.target.value)} autoFocus />
              </label>
              <label>
                Via
                <input
                  value={step.via}
                  list="relay-via-choices"
                  placeholder="Frequency, phone…"
                  onChange={(e) => set("via", e.target.value)}
                />
              </label>
            </>
          )}
          {step.kind !== "passed" && (
            <label className="relay-step-note">
              {step.kind === "attempt" ? "What happened (optional)" : "Why"}
              <input
                value={step.note}
                placeholder={step.kind === "attempt" ? "e.g. No contact" : "e.g. EOC closed; no path"}
                onChange={(e) => set("note", e.target.value)}
                autoFocus={step.kind === "not_passed"}
              />
            </label>
          )}
        </div>
        <div className="inline-form">
          <button className="primary" onClick={saveStep}>
            Save
          </button>
          <button onClick={() => setStep(null)}>Cancel</button>
          {stepError && (
            <span className="weather-area-error" role="alert">
              {stepError}
            </span>
          )}
        </div>
      </div>
    );
  }

  function card(m: RelayMessage) {
    const original = m.reply_to ? byId.get(m.reply_to) : undefined;
    const replies = messages.filter((r) => r.reply_to === m.id);
    return (
      <div key={m.id} className={`relay-message relay-message-${m.status}`}>
        <div className="relay-message-head">
          <span className="relay-time">{when(m.received_at)}</span>
          <span>
            <strong>{m.from_station}</strong> → <strong>{m.for_station}</strong>
          </span>
          {m.received_via && <span className="settings-hint">on {m.received_via}</span>}
          {original && (
            <span className="settings-hint">
              reply to {original.from_station}'s message of {when(original.received_at)}
            </span>
          )}
          <span className={`relay-status relay-status-${m.status}`}>{relayStatusLabel(m.status)}</span>
        </div>
        <div className="relay-message-text">{m.message}</div>
        {m.steps.length > 0 && (
          <ul className="relay-steps">
            {m.steps.map((s) => (
              <li key={s.id}>
                <span className="relay-time">{when(s.at)}</span> {stepText(s)}
                {!readOnly && (
                  <button className="link-button" onClick={() => undo(s)} title="Take back a step recorded by mistake">
                    Undo
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {replies.length > 0 && (
          <div className="settings-hint">
            Reply logged: {replies.map((r) => `${when(r.received_at)} from ${r.from_station}`).join("; ")}
          </div>
        )}
        {!readOnly && (
          <div className="inline-form relay-actions">
            {m.status === "held" ? (
              <>
                <button className="primary" onClick={() => openStep(m, "passed")}>
                  Passed…
                </button>
                <button onClick={() => openStep(m, "attempt")}>Attempt failed…</button>
                <button onClick={() => openStep(m, "not_passed")}>Couldn't pass…</button>
              </>
            ) : (
              <>
                <button onClick={() => reply(m)} title="Log the answer coming back, with From and For swapped">
                  Reply…
                </button>
              </>
            )}
            <button onClick={() => edit(m)}>Edit</button>
            <button onClick={() => setRemoving({ id: m.id, reason: "" })}>Remove</button>
          </div>
        )}
        {removing?.id === m.id && (
          <RemoveConfirmBar
            question="Remove this message?"
            reason={removing.reason}
            onReasonChange={(reason) => setRemoving({ ...removing, reason })}
            onConfirm={confirmRemove}
            onCancel={() => setRemoving(null)}
          />
        )}
        {stepForm(m)}
      </div>
    );
  }

  return (
    <div className="relay-workspace">
      <datalist id="relay-via-choices">
        {viaChoices.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      {!readOnly && (
        <div className="checkin-entry relay-entry" onKeyDown={enterSaves(saveMessage)}>
          <h3>
            <Send className="heading-icon" />
            {editingId ? "Edit message" : draft.replyTo ? "Log a reply" : "Message received"}
          </h3>
          {draft.replyTo && !editingId && (
            <p className="settings-hint">
              Answering {draft.replyTo.from_station}'s message to {draft.replyTo.for_station} of{" "}
              {when(draft.replyTo.received_at)}.
            </p>
          )}
          <div className="relay-entry-grid">
            <label>
              Time
              <input
                value={draft.at}
                placeholder={formatContactTime(new Date()).slice(0, 16)}
                title={TIME_HINT}
                onChange={(e) => setDraft({ ...draft, at: e.target.value })}
              />
            </label>
            <label>
              From
              <input
                ref={fromRef}
                value={draft.from}
                placeholder="Call sign or tactical, e.g. Shelter 2"
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                autoFocus
              />
            </label>
            <label>
              For
              <input
                value={draft.for}
                placeholder="Who it's going to, e.g. EOC"
                onChange={(e) => setDraft({ ...draft, for: e.target.value })}
              />
            </label>
            <label>
              Received via
              <input
                value={draft.via}
                list="relay-via-choices"
                placeholder="Frequency, phone…"
                onChange={(e) => setDraft({ ...draft, via: e.target.value })}
              />
            </label>
          </div>
          <label>
            Message
            <textarea
              rows={3}
              value={draft.message}
              placeholder="The sitrep or message, or a summary of it"
              onChange={(e) => setDraft({ ...draft, message: e.target.value })}
              onKeyDown={(e) => {
                // Ctrl+Enter saves from the message box; Enter alone starts a new line.
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  saveMessage();
                }
              }}
            />
          </label>
          <div className="report-entry-actions">
            <button className="primary" onClick={saveMessage}>
              {editingId ? "Save changes" : "Log message"}
            </button>
            {(editingId || draft.replyTo) && <button onClick={cancelDraft}>Cancel</button>}
            {error && (
              <span className="weather-area-error" role="alert">
                {error}
              </span>
            )}
          </div>
        </div>
      )}

      {readOnly && error && (
        <p className="weather-area-error" role="alert">
          {error}
        </p>
      )}

      <div className="panel relay-list">
        <div className="panel-header-row">
          <h3>To pass ({held.length})</h3>
          <SortToggle order={order} onToggle={toggleOrder} />
        </div>
        {held.length === 0 ? (
          <p className="checkin-empty-state">Nothing waiting to be passed on.</p>
        ) : (
          held.map(card)
        )}
      </div>

      <div className="panel relay-list">
        <div className="panel-header-row">
          <h3>Done ({done.length})</h3>
          <button onClick={() => setShowRemoved((v) => !v)}>
            {showRemoved ? "Hide removed" : `Removed (${removed.length})`}
          </button>
        </div>
        {done.length === 0 ? (
          <p className="checkin-empty-state">No messages passed on or closed out yet.</p>
        ) : (
          done.map(card)
        )}
        {showRemoved && (
          <RemovedPanel
            title="Removed messages"
            emptyText="No removed messages."
            items={removed}
            renderItem={(m) => (
              <span>
                {when(m.received_at)} {m.from_station} → {m.for_station}: {m.message}
                {m.void_reason && <span className="settings-hint"> — removed: {m.void_reason}</span>}
              </span>
            )}
            onRestore={(id) => (readOnly ? setError("This activity is closed.") : restore(id))}
          />
        )}
      </div>
    </div>
  );
}
