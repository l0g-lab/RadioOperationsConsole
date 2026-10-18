import { useEffect, useRef, useState } from "react";
import * as api from "../../api";
import type { Activity, RelayMessage, RelayStep, RelayStepKind } from "../../types";
import { formatContactTime } from "../../utils";
import { enterSaves, HeldActions, MessageCard, StepForm, TIME_HINT, timeOrNow, viaChoicesFrom, when } from "./RelaySteps";
import { RemoveConfirmBar, RemovedPanel } from "../RemoveControls";
import { Send } from "lucide-react";
import SortToggle from "../SortToggle";
import SuggestInput, { earlierEntries } from "../SuggestInput";
import { sortByTime, useSortOrder } from "../../hooks/useSortOrder";

interface Draft {
  at: string;
  from: string;
  for: string;
  via: string;
  message: string;
  replyTo: RelayMessage | null;
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
  const [step, setStep] = useState<{ messageId: string; kind: RelayStepKind } | null>(null);
  const [removing, setRemoving] = useState<{ id: string; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const viaChoices = viaChoicesFrom(activity.frequency, messages);
  // Everyone named so far, sender, addressee or next hop, to fill in again:
  // the same few stations and tactical names come up all session.
  const stationChoices = messages.flatMap((m) => [
    m.from_station,
    m.for_station,
    ...m.steps.map((s) => s.station),
  ]);

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
    setStep({ messageId: m.id, kind });
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

  function card(m: RelayMessage) {
    const original = m.reply_to ? byId.get(m.reply_to) : undefined;
    const replies = messages.filter((r) => r.reply_to === m.id);
    return (
      <MessageCard
        key={m.id}
        message={m}
        title={
          <>
            <span className="relay-time">{when(m.received_at)}</span>
            <span>
              <strong>{m.from_station}</strong> → <strong>{m.for_station}</strong>
            </span>
          </>
        }
        extra={
          original && (
            <span className="settings-hint">
              reply to {original.from_station}'s message of {when(original.received_at)}
            </span>
          )
        }
        onUndo={undo}
      >
        {replies.length > 0 && (
          <div className="settings-hint">
            Reply logged: {replies.map((r) => `${when(r.received_at)} from ${r.from_station}`).join("; ")}
          </div>
        )}
        {/* Passing a message on is recorded even once the activity is closed (LIFE-013). */}
        {(m.status === "held" || !readOnly) && (
          <div className="inline-form relay-actions">
            {m.status === "held" ? (
              <HeldActions onStep={(kind) => openStep(m, kind)} />
            ) : (
              <>
                <button onClick={() => reply(m)} title="Log the answer coming back, with From and For swapped">
                  Reply…
                </button>
              </>
            )}
            {!readOnly && <button onClick={() => edit(m)}>Edit</button>}
            {!readOnly && <button onClick={() => setRemoving({ id: m.id, reason: "" })}>Remove</button>}
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
        {step?.messageId === m.id && (
          <StepForm
            key={step.kind}
            message={m}
            kind={step.kind}
            stationChoices={stationChoices}
            viaChoices={viaChoices}
            operatorId={operatorId}
            onSaved={() => {
              setStep(null);
              refresh();
            }}
            onCancel={() => setStep(null)}
          />
        )}
      </MessageCard>
    );
  }

  return (
    <div className="relay-workspace">
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
              <SuggestInput
                id="relay-from"
                listLabel="Stations"
                inputRef={fromRef}
                value={draft.from}
                placeholder="Call sign or tactical, e.g. Shelter 2"
                onChange={(v) => setDraft({ ...draft, from: v })}
                suggest={(t) => earlierEntries(t, stationChoices)}
                autoFocus
              />
            </label>
            <label>
              For
              <SuggestInput
                id="relay-for"
                listLabel="Stations"
                value={draft.for}
                placeholder="Who it's going to, e.g. EOC"
                onChange={(v) => setDraft({ ...draft, for: v })}
                suggest={(t) => earlierEntries(t, stationChoices)}
              />
            </label>
            <label>
              Received via
              <SuggestInput
                id="relay-via"
                listLabel="Ways received"
                value={draft.via}
                placeholder="Frequency, phone…"
                onChange={(v) => setDraft({ ...draft, via: v })}
                suggest={(t) => earlierEntries(t, viaChoices)}
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
