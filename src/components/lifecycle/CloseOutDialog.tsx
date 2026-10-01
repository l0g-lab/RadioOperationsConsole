import { useEffect, useState } from "react";
import * as api from "../../api";
import { summaryFacts } from "../../summaryFacts";
import ExportOptions from "../exports/ExportOptions";
import type { Activity, ActivitySummary, Operator } from "../../types";
import { formatDuration } from "../../export";
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
}: {
  activity: Activity;
  operator: Operator | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [conclusion, setConclusion] = useState(activity.conclusion);
  const [archive, setArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .activitySummary(activity.id)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [activity.id]);

  async function endNet() {
    setBusy(true);
    setError(null);
    try {
      await api.closeActivity(activity.id, conclusion.trim() || null, operator?.id ?? null);
      if (archive) {
        await api.archiveActivity(activity.id, "Archived when the net ended", operator?.id ?? null);
      }
      onDone();
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
          <h3><CircleStop className="heading-icon" />End net — {activity.title}</h3>
          <button onClick={onClose}>Cancel</button>
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

        <label className="checkbox-row">
          <input type="checkbox" checked={archive} onChange={(e) => setArchive(e.target.checked)} />
          Archive this activity after ending it
        </label>

        {error && <p className="weather-area-error">{error}</p>}

        <div className="inline-form">
          <button onClick={endNet} disabled={busy}>
            End net
          </button>
          <button onClick={onClose} disabled={busy}>
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}
