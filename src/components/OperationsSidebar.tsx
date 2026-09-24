import type { Activity } from "../types";
import { splitScheduledAt } from "../utils";

interface OperationsSidebarProps {
  activities: Activity[];
  selectedActivityId: string | null;
  onSelectActivity: (id: string) => void;
}

export default function OperationsSidebar({
  activities,
  selectedActivityId,
  onSelectActivity,
}: OperationsSidebarProps) {
  // Grouped by date only (not the full scheduled_at, which may also carry a
  // time) so same-day activities land in one group instead of splintering
  // into a group of their own — the time is shown per-row instead, since
  // that's what actually tells same-day duplicates apart.
  const groups = new Map<string, Activity[]>();
  for (const a of activities) {
    const key = splitScheduledAt(a.scheduled_at).date || "<unscheduled>";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  const groupKeys = Array.from(groups.keys()).sort().reverse();

  return (
    <aside className="ops-sidebar">
      <div className="panel">
        <h3>Activities</h3>
        {activities.length === 0 && (
          <p className="checkin-empty-state">
            No activities yet. Create one in the main window.
          </p>
        )}
        {groupKeys.map((key) => (
          <details key={key} open>
            <summary>{key}</summary>
            {(groups.get(key) ?? []).map((a) => {
              const time = splitScheduledAt(a.scheduled_at).time;
              return (
                <div
                  key={a.id}
                  className={"selectable" + (selectedActivityId === a.id ? " selected" : "")}
                  onClick={() => onSelectActivity(a.id)}
                >
                  {time ? `${time} — ${a.title}` : a.title}
                </div>
              );
            })}
          </details>
        ))}
      </div>
    </aside>
  );
}
