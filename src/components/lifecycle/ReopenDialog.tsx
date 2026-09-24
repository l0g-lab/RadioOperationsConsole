import { useState } from "react";
import * as api from "../../api";
import type { Activity } from "../../types";

/** Reopening a closed activity needs a reason, which goes into its history. */
export default function ReopenDialog({
  activity,
  operatorId,
  onClose,
  onDone,
}: {
  activity: Activity;
  operatorId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reopen() {
    if (!reason.trim()) {
      setError("Say why you're reopening this activity.");
      return;
    }
    setBusy(true);
    try {
      await api.reopenActivity(activity.id, reason.trim(), operatorId);
      onDone();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel lifecycle-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Reopen — {activity.title}</h3>
          <button onClick={onClose}>Cancel</button>
        </div>
        <p className="settings-hint">
          Reopening lets you add and change records again. The reason is saved in the activity's
          history.
        </p>
        <div className="inline-form">
          <input
            autoFocus
            className="lifecycle-reason"
            placeholder="Reason for reopening"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") reopen();
              if (e.key === "Escape") onClose();
            }}
          />
          <button onClick={reopen} disabled={busy}>
            Reopen activity
          </button>
        </div>
        {error && <p className="weather-area-error">{error}</p>}
      </div>
    </div>
  );
}
