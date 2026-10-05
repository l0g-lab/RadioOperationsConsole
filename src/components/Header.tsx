import { useEffect, useState } from "react";
import type { Activity, Operator } from "../types";
import { nowLocal, nowUtc } from "../utils";
import ActivityStateControls from "./lifecycle/ActivityStateControls";
import OnlineStatusToggle from "./OnlineStatusToggle";
import { activityTypeLabel } from "../activityTypes";
import { Radio } from "lucide-react";

interface HeaderProps {
  operators: Operator[];
  /** Who runs the selected activity (net control). */
  activityOperatorId: string | null;
  activities: Activity[];
  selectedActivityId: string | null;
  onSelectActivity: (id: string) => void;
  /** Jumps to where the selected activity is edited. */
  onEditActivity: () => void;
  /** Jumps to the new-activity form. */
  onNewActivity: () => void;
  /** Reload activities after a lifecycle change. */
  onActivitiesChanged: () => void;
}

/** The Activity list's last entry, which starts a new one rather than choosing one. */
const NEW_ACTIVITY = "__new_activity__";

/** How many closed nets the top bar lists; the rest are in the Operations tab's Activities table. */
const RECENT_CLOSED = 10;

/**
 * The activities the top bar's list offers: everything not finished, the most
 * recently closed nets, and whichever is selected. Older ones are in the
 * Operations tab's Activities list.
 */
export function topBarActivities(activities: Activity[], selectedId: string | null): Activity[] {
  const recent = new Set(
    activities
      .filter((a) => a.state === "closed")
      .sort((a, b) => b.closed_at.localeCompare(a.closed_at))
      .slice(0, RECENT_CLOSED)
      .map((a) => a.id)
  );
  return activities.filter((a) => a.state !== "closed" || recent.has(a.id) || a.id === selectedId);
}

export default function Header({
  operators,
  activityOperatorId,
  activities,
  selectedActivityId,
  onSelectActivity,
  onEditActivity,
  onNewActivity,
  onActivitiesChanged,
}: HeaderProps) {
  const selectedActivity = activities.find((a) => a.id === selectedActivityId) ?? null;
  const runBy = operators.find((o) => o.id === activityOperatorId) ?? null;
  const listed = topBarActivities(activities, selectedActivityId);
  const [local, setLocal] = useState(nowLocal());
  const [utc, setUtc] = useState(nowUtc());

  useEffect(() => {
    const id = setInterval(() => {
      setLocal(nowLocal());
      setUtc(nowUtc());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="app-header">
      <h1><Radio className="heading-icon" />Radio Operations Console</h1>
      <div className="header-sep" />
      <OnlineStatusToggle />
      <div className="header-sep" />
      <label className="header-field header-activity">
        Activity:
        <select
          value={selectedActivityId ?? ""}
          onChange={(e) => {
            if (e.target.value === NEW_ACTIVITY) onNewActivity();
            else onSelectActivity(e.target.value);
          }}
          title="The activity every tab works on. Ctrl+[ and Ctrl+] switch between activities."
        >
          {activities.length === 0 && <option value="">No activities yet</option>}
          {listed.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
              {a.scheduled_at ? ` — ${a.scheduled_at}` : ""}
              {a.state === "closed" ? " (closed)" : ""}
            </option>
          ))}
          {listed.length < activities.length && (
            <option disabled>Older nets: Operations → Activities</option>
          )}
          <option value={NEW_ACTIVITY}>+ New activity…</option>
        </select>
      </label>
      {selectedActivity && (
        <span className="header-activity-meta">
          {selectedActivity.frequency && (
            <span className="header-frequency" title="Frequency">
              {selectedActivity.frequency}
            </span>
          )}
          <span className="type-pill" title="Activity type">
            {activityTypeLabel(selectedActivity.activity_type)}
          </span>
          {runBy && (
            <span className="header-operator" title="Net control: everything in this activity is logged under this operator. Change it with Edit.">
              {runBy.call_sign || runBy.display_name}
            </span>
          )}
          <ActivityStateControls
            activity={selectedActivity}
            operator={operators.find((o) => o.id === activityOperatorId) ?? null}
            onChanged={onActivitiesChanged}
            onSelectActivity={onSelectActivity}
          />
          <button className="link-button" onClick={onEditActivity}>
            Edit
          </button>
        </span>
      )}
      <span className="header-clocks header-clocks-right">
        <span>Local: {local}</span>
        <span>UTC: {utc}</span>
      </span>
    </header>
  );
}
