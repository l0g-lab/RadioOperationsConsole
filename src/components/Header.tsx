import { useEffect, useState } from "react";
import type { Activity, Operator } from "../types";
import { nowLocal, nowUtc } from "../utils";
import ActivityStateControls from "./lifecycle/ActivityStateControls";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { activityTypeLabel } from "../activityTypes";

interface HeaderProps {
  operators: Operator[];
  selectedOperatorId: string | null;
  onSelectOperator: (id: string) => void;
  activities: Activity[];
  selectedActivityId: string | null;
  onSelectActivity: (id: string) => void;
  /** Jumps to where the selected activity is edited. */
  onEditActivity: () => void;
  /** Reload activities after a lifecycle change. */
  onActivitiesChanged: () => void;
}

export default function Header({
  operators,
  selectedOperatorId,
  onSelectOperator,
  activities,
  selectedActivityId,
  onSelectActivity,
  onEditActivity,
  onActivitiesChanged,
}: HeaderProps) {
  const selectedActivity = activities.find((a) => a.id === selectedActivityId) ?? null;
  const online = useOnlineStatus();
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
      <h1>Radio Operations Console</h1>
      <div className="header-sep" />
      <span
        className={online ? "online-pill online-pill-online" : "online-pill online-pill-offline"}
        title={
          online
            ? "The operating system reports a network connection. Individual online features (QRZ, weather, APRS-IS, maps) may still be unreachable."
            : "No network connection detected. Offline features keep working; online add-ons (QRZ, weather, APRS-IS, maps, updates) are unavailable."
        }
      >
        <span className="online-dot" aria-hidden="true" />
        {online ? "Online" : "Offline"}
      </span>
      <div className="header-sep" />
      <label className="header-field">
        Operator:
        <select value={selectedOperatorId ?? ""} onChange={(e) => onSelectOperator(e.target.value)}>
          <option value="">&lt;none&gt;</option>
          {operators.map((o) => (
            <option key={o.id} value={o.id}>
              {o.display_name} ({o.call_sign})
            </option>
          ))}
        </select>
      </label>
      <div className="header-sep" />
      <label className="header-field header-activity">
        Activity:
        <select
          value={selectedActivityId ?? ""}
          onChange={(e) => onSelectActivity(e.target.value)}
          disabled={activities.length === 0}
          title="The activity every tab works on. Ctrl+[ and Ctrl+] switch between activities."
        >
          {activities.length === 0 && <option value="">No activities yet</option>}
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
              {a.scheduled_at ? ` — ${a.scheduled_at}` : ""}
              {a.state === "closed" ? " (closed)" : ""}
            </option>
          ))}
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
          <ActivityStateControls
            activity={selectedActivity}
            operator={operators.find((o) => o.id === selectedOperatorId) ?? null}
            onChanged={onActivitiesChanged}
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
