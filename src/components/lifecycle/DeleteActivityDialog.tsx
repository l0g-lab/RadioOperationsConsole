import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, DeletedCounts } from "../../types";
import { Trash2 } from "lucide-react";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Permanently deleting an activity (AUDIT-007, AUDIT-008): says exactly what
 * will be erased and that it can't be undone, and only unlocks once the
 * operator types the activity's title.
 */
export default function DeleteActivityDialog({
  activity,
  operatorId,
  onClose,
  onDeleted,
}: {
  activity: Activity;
  operatorId: string | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [counts, setCounts] = useState<DeletedCounts | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .activityDeletePreview(activity.id)
      .then(setCounts)
      .catch((e) => setError(String(e)));
  }, [activity.id]);

  const matches = typed.trim().toLowerCase() === activity.title.trim().toLowerCase();

  async function remove() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteActivity(activity.id, operatorId);
      onDeleted();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel lifecycle-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Trash2 className="heading-icon heading-icon-danger" />Delete permanently — {activity.title}</h3>
          <button onClick={onClose}>Cancel</button>
        </div>
        <p>
          This erases the activity
          {counts
            ? ` and its ${plural(counts.checkins, "check-in", "check-ins")} and ${plural(
                counts.spotter_reports,
                "spotter report",
                "spotter reports"
              )}`
            : ", its check-ins and spotter reports"}
          , including removed ones and their history. <strong>It cannot be undone.</strong>
        </p>
        <p className="settings-hint">
          Only this computer's records are erased: existing backups and exported files are not
          affected. To keep a copy, export it from the Exports tab first. The history will note that
          this activity was deleted, by whom, and how many records it held.
        </p>
        <div className="inline-form">
          <label htmlFor="delete-activity-confirm">Type the activity's title to confirm:</label>
          <input
            id="delete-activity-confirm"
            autoFocus
            placeholder={activity.title}
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") remove();
              if (e.key === "Escape") onClose();
            }}
          />
          <button className="danger" onClick={remove} disabled={!matches || busy}>
            Delete permanently
          </button>
        </div>
        {error && <p className="weather-area-error">{error}</p>}
      </div>
    </div>
  );
}
