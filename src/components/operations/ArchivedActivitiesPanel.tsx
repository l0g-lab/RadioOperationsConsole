import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity } from "../../types";
import DeleteActivityDialog from "../lifecycle/DeleteActivityDialog";
import SummaryDialog from "../exports/SummaryDialog";
import { Archive } from "lucide-react";

interface Props {
  activities: Activity[];
  selectedOperatorId: string | null;
  onActivitiesChanged: () => void;
}

export default function ArchivedActivitiesPanel({
  activities,
  selectedOperatorId,
  onActivitiesChanged,
}: Props) {
  const [showArchived, setShowArchived] = useState(false);
  const [archivedActivities, setArchivedActivities] = useState<Activity[]>([]);
  const [deleting, setDeleting] = useState<Activity | null>(null);
  // Read an archived activity's summary without restoring it.
  const [viewing, setViewing] = useState<Activity | null>(null);

  async function refreshArchived() {
    const list = await api.listArchivedActivities().catch(() => []);
    setArchivedActivities(list);
  }

  async function toggleShowArchived() {
    const next = !showArchived;
    setShowArchived(next);
    if (next) await refreshArchived();
  }

  // Keeps this list in sync when an activity is archived elsewhere (the
  // Selected Activity panel) while this one is already open, without the
  // two panels needing to talk to each other directly.
  useEffect(() => {
    if (showArchived) refreshArchived();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities]);

  async function handleRestoreActivity(id: string) {
    await api.restoreActivity(id, selectedOperatorId);
    onActivitiesChanged();
    await refreshArchived();
  }

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h3><Archive className="heading-icon" />Archived Activities</h3>
        <button className="link-button" onClick={toggleShowArchived}>
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </div>
      {showArchived && (
        <>
          {archivedActivities.length === 0 && (
            <p className="checkin-empty-state">None archived.</p>
          )}
          {archivedActivities.map((a) => (
            <div key={a.id} className="activity-row">
              <span>
                {a.title}
                {a.scheduled_at ? ` — ${a.scheduled_at}` : ""}
              </span>
              <span className="inline-form">
                <button onClick={() => setViewing(a)} aria-label={`Show summary of ${a.title}`}>
                  Show summary
                </button>
                <button onClick={() => handleRestoreActivity(a.id)}>Restore</button>
                <button className="danger" onClick={() => setDeleting(a)}>
                  Delete…
                </button>
              </span>
            </div>
          ))}
        </>
      )}
      {viewing && <SummaryDialog activity={viewing} onClose={() => setViewing(null)} />}
      {deleting && (
        <DeleteActivityDialog
          activity={deleting}
          operatorId={selectedOperatorId}
          onClose={() => setDeleting(null)}
          onDeleted={async () => {
            setDeleting(null);
            await refreshArchived();
          }}
        />
      )}
    </div>
  );
}
