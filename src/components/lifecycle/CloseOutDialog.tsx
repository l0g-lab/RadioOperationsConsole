import { useEffect, useState } from "react";
import * as api from "../../api";
import { summaryFacts } from "../../summaryFacts";
import ExportOptions from "../exports/ExportOptions";
import type { Activity, ActivitySummary, Operator } from "../../types";
import { formatDuration } from "../../export";
import { isRelay } from "../../activityTypes";
import { previousEnd, suggestedEnd } from "../../activityTimes";
import { formatContactTime } from "../../utils";
import { nextInEvent, relativeTime, type NextInEvent } from "../../events";
import { CircleStop } from "lucide-react";

/**
 * Wrapping up a net: a summary of what happened, a heads-up about anything
 * left open, the chance to write a conclusion and save the records, and then
 * closing. Ending is one click at the bottom; nothing here blocks it, and every
 * export stays available afterward on the Exports tab.
 */
export default function CloseOutDialog({
  activity,
  operator,
  onClose,
  onDone,
  onSelectActivity,
}: {
  activity: Activity;
  operator: Operator | null;
  onClose: () => void;
  onDone: () => void;
  /** Switches to another activity: the next in the event, once it's started. */
  onSelectActivity?: (id: string) => void;
}) {
  const noun = isRelay(activity.activity_type) ? "relay" : "net";
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [conclusion, setConclusion] = useState(activity.conclusion);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Besides ending now, an earlier end is offered: for a reopened net, when it
  // first ended or the last entry since if later; otherwise the last entry
  // (LIFE-008).
  const [earlier, setEarlier] = useState<{ at: string; why: string } | null>(null);
  // What comes next in this activity's event, if it's in one (EVT-030).
  const [next, setNext] = useState<NextInEvent | null>(null);
  const [startedNext, setStartedNext] = useState(false);

  useEffect(() => {
    if (!activity.event) return;
    api
      .listActivities()
      .then((all) => setNext(nextInEvent(all, activity)))
      .catch(() => setNext(null));
  }, [activity]);

  async function startNext() {
    if (!next) return;
    setError(null);
    try {
      await api.startActivity(next.activity.id, next.activity.operator_id || operator?.id || null);
      setStartedNext(true);
    } catch (e) {
      setError(String(e));
    }
  }

  // Once the next one is started, it's where the operator goes after this.
  const leave = (then: () => void) => () => {
    then();
    if (startedNext && next) onSelectActivity?.(next.activity.id);
  };

  useEffect(() => {
    api
      .activitySummary(activity.id)
      .then(setSummary)
      .catch(() => setSummary(null));
    Promise.all([
      api.activityHistory(activity.id).catch(() => []),
      api.listCheckins(activity.id).catch(() => []),
      api.listSpotterReports(activity.id).catch(() => []),
      api.listRelayMessages(activity.id).catch(() => []),
    ]).then(([history, checkins, reports, relayed]) => {
      const entries: [string, string[]][] = [
        ["the last check-in", checkins.map((c) => c.checked_in_at)],
        ["the last spotter report", reports.map((r) => r.reported_at)],
        ["the last relay message", relayed.flatMap((m) => [m.received_at, ...m.steps.map((s) => s.at)])],
      ];
      const previous = previousEnd(history);
      let best: { at: string; why: string } | null = previous
        ? { at: suggestedEnd(previous, []), why: "when it first ended" }
        : null;
      for (const [why, times] of entries) {
        const at = suggestedEnd(previous || "1970-01-01T00:00:00Z", times);
        if (at && times.length > 0 && (!best || at > best.at)) best = { at, why };
      }
      // Only worth offering when it's earlier than now and after the start.
      const t = best ? new Date(best.at).getTime() : NaN;
      const start = new Date(activity.opened_at).getTime();
      if (best && t < Date.now() - 60_000 && !(t < start)) setEarlier(best);
    });
  }, [activity.id, activity.opened_at]);

  /** "20:48", with the date in front when it isn't today. */
  const shortTime = (iso: string) => {
    const full = formatContactTime(iso);
    return full.slice(0, 10) === formatContactTime(new Date()).slice(0, 10) ? full.slice(11, 16) : full.slice(0, 16);
  };

  async function endNet(endedAt: string | null) {
    setBusy(true);
    setError(null);
    try {
      await api.closeActivity(
        activity.id,
        conclusion.trim() || null,
        operator?.id ?? null,
        endedAt
      );
      leave(onDone)();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  const duration = summary ? formatDuration(summary.opened_at, new Date().toISOString()) : "";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel lifecycle-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><CircleStop className="heading-icon" />End {noun} — {activity.title}</h3>
        </div>

        {summary && (
          <div className="summary-grid">
            {summaryFacts(activity.activity_type, summary).map((f) => (
              <div key={f.key}>
                {f.text}
                {f.detail && <span className="settings-hint"> {f.detail}</span>}
              </div>
            ))}
            {duration && (
              <div>
                Open for <strong>{duration}</strong>
              </div>
            )}
          </div>
        )}

        {summary && summary.open_traffic_items > 0 && (
          <p className="closeout-warning" role="alert">
            {summary.open_traffic_items} check-in
            {summary.open_traffic_items === 1
              ? " has traffic that hasn't"
              : "s have traffic that haven't"}{" "}
            been marked handled. You can still end the net; the traffic stays on those check-ins.
          </p>
        )}

        {summary && summary.held_relay_messages > 0 && (
          <p className="closeout-warning" role="alert">
            {summary.held_relay_messages === 1
              ? "1 relay message is still waiting to be passed on."
              : `${summary.held_relay_messages} relay messages are still waiting to be passed on.`}{" "}
            Mark each as passed or not passed on the Messages tab, or end anyway: they stay held.
          </p>
        )}

        <label className="closeout-conclusion">
          Net conclusion / notes (optional)
          <textarea
            rows={3}
            placeholder="e.g. Net secured at 20:45. Next net Tuesday."
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
          />
        </label>

        <details className="closeout-exports">
          <summary>Save copies of the records first (optional)</summary>
          <p className="settings-hint">
            These are the same exports as the Exports tab, which keeps working after the net ends.
          </p>
          <ExportOptions activity={activity} operator={operator} conclusion={conclusion} />
        </details>


        {error && <p className="weather-area-error">{error}</p>}

        <div className="inline-form">
          <button className="primary" onClick={() => endNet(null)} disabled={busy}>
            End now
          </button>
          {earlier && (
            <button
              onClick={() => endNet(earlier.at)}
              disabled={busy}
              title={`End it at ${earlier.why}`}
            >
              End at {shortTime(earlier.at)}
            </button>
          )}
          <button onClick={leave(onClose)} disabled={busy}>
            Cancel
          </button>
        </div>
        {earlier && (
          <p className="settings-hint">
            {shortTime(earlier.at)} is {earlier.why}.
          </p>
        )}

        {next && (
          <div className="closeout-next">
            {startedNext ? (
              <span>
                <strong>{next.activity.title}</strong> has started; you'll be switched to it when
                this window closes.
              </span>
            ) : (
              <>
                <span>
                  Next in {activity.event}: <strong>{next.activity.title}</strong>
                  {next.at != null &&
                    ` at ${shortTime(new Date(next.at).toISOString())} (${relativeTime(next.at)})`}
                  .
                </span>
                {/* Offered only near its time, so nobody starts it early by accident. */}
                {next.due && (
                  <button onClick={startNext} disabled={busy}>
                    Start {next.activity.title}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
