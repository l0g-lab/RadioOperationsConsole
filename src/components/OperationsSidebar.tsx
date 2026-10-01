import type { Activity } from "../types";
import { isLog } from "../activityTypes";
import { splitScheduledAt } from "../utils";
import { ListChecks } from "lucide-react";

interface OperationsSidebarProps {
  activities: Activity[];
  selectedActivityId: string | null;
  onSelectActivity: (id: string) => void;
}

export const LOGS_GROUP = "Station logs";
export const UNSCHEDULED_GROUP = "Unscheduled";

/**
 * The sidebar's groups, in display order: station logs first (they're
 * ongoing, so a date means nothing for them), then nets by date, newest
 * first, then anything without a date. Within a group, activities keep the
 * order they came in (logs alphabetically).
 */
export function groupActivities(activities: Activity[]): [string, Activity[]][] {
  const logs = activities
    .filter((a) => isLog(a.activity_type))
    .sort((a, b) => a.title.localeCompare(b.title));
  // Grouped by date only (not the full scheduled_at, which may also carry a
  // time) so same-day activities land in one group instead of splintering
  // into a group of their own — the time is shown per-row instead, since
  // that's what actually tells same-day duplicates apart.
  const byDate = new Map<string, Activity[]>();
  const unscheduled: Activity[] = [];
  for (const a of activities) {
    if (isLog(a.activity_type)) continue;
    const date = splitScheduledAt(a.scheduled_at).date;
    if (!date) {
      unscheduled.push(a);
      continue;
    }
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(a);
  }
  const groups: [string, Activity[]][] = [];
  if (logs.length) groups.push([LOGS_GROUP, logs]);
  for (const date of Array.from(byDate.keys()).sort().reverse()) {
    groups.push([date, byDate.get(date)!]);
  }
  if (unscheduled.length) groups.push([UNSCHEDULED_GROUP, unscheduled]);
  return groups;
}

export default function OperationsSidebar({
  activities,
  selectedActivityId,
  onSelectActivity,
}: OperationsSidebarProps) {
  return (
    <aside className="ops-sidebar">
      <div className="panel">
        <h3>
          <ListChecks className="heading-icon" />
          Activities
        </h3>
        {activities.length === 0 && (
          <p className="checkin-empty-state">No activities yet. Create one in the main window.</p>
        )}
        {groupActivities(activities).map(([group, items]) => (
          <details key={group} open>
            <summary>{group}</summary>
            {items.map((a) => {
              const time = isLog(a.activity_type) ? "" : splitScheduledAt(a.scheduled_at).time;
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
