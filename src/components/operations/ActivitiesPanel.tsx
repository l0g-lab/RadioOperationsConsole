import { useState } from "react";
import type { Activity } from "../../types";
import { activityTypeLabel } from "../../activityTypes";
import { activityRows, viewCounts, type ActivityView } from "../../activityList";
import { mhzFromText } from "../../bands";
import ActivityTypeIcon from "../ActivityTypeIcon";
import BandChip from "../BandChip";
import { ListChecks } from "lucide-react";

/** Rows shown before "Show more", so years of closed nets don't make a wall. */
const PAGE = 25;

const VIEWS: { id: ActivityView; label: string }[] = [
  { id: "current", label: "Now & coming up" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];

/**
 * Every activity, one line each, at the top of the Operations tab
 * (UX-OPS-015): type, name, band, when, state (open in green, due in amber),
 * and event. Clicking one selects it for the panels below; the top bar's
 * Activity list stays the quick way to switch from any tab.
 */
export default function ActivitiesPanel({
  activities,
  selectedActivityId,
  onSelectActivity,
  onNewActivity,
}: {
  activities: Activity[];
  selectedActivityId: string | null;
  onSelectActivity: (id: string) => void;
  onNewActivity: () => void;
}) {
  const [view, setView] = useState<ActivityView>("current");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const now = new Date();
  const rows = activityRows(activities, view, query, now);
  const counts = viewCounts(activities);
  const searching = query.trim() !== "";

  function choose(v: ActivityView) {
    setView(v);
    setShown(PAGE);
  }

  return (
    <div className="panel activities-panel">
      <div className="panel-header-row">
        <h3>
          <ListChecks className="heading-icon" />
          Activities
        </h3>
        <div className="checkin-roster-header-actions">
          {activities.length > 0 && (
            <>
              <div className="activity-views" role="group" aria-label="Show">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    className={"activity-view" + (view === v.id && !searching ? " activity-view-chosen" : "")}
                    aria-pressed={view === v.id && !searching}
                    onClick={() => choose(v.id)}
                  >
                    {v.label} <span className="activity-view-count">{counts[v.id]}</span>
                  </button>
                ))}
              </div>
              <input
                type="search"
                className="checkin-roster-search activities-search"
                aria-label="Search activities"
                placeholder="Search activities"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(PAGE);
                }}
              />
            </>
          )}
          <button className="primary" onClick={onNewActivity}>
            + New activity
          </button>
        </div>
      </div>

      {activities.length === 0 ? (
        <p className="checkin-empty-state">No activities yet — start with + New activity.</p>
      ) : rows.length === 0 ? (
        <p className="checkin-empty-state">
          {searching
            ? `No activities match “${query.trim()}”.`
            : view === "current"
              ? "Nothing open or coming up. Closed ones are under Closed."
              : "No closed activities yet."}
        </p>
      ) : (
        <div className="activity-table" role="list" aria-label="Activities">
          {rows.slice(0, shown).map(({ activity: a, when, state, tone }) => (
            <button
              key={a.id}
              role="listitem"
              className={"activity-table-row" + (a.id === selectedActivityId ? " selected" : "")}
              aria-current={a.id === selectedActivityId || undefined}
              onClick={() => onSelectActivity(a.id)}
            >
              <span className="activity-table-name">
                <ActivityTypeIcon type={a.activity_type} />
                <span className="activity-table-title">{a.title}</span>
              </span>
              <span className="activity-table-band">
                <BandChip mhz={mhzFromText(a.frequency)} />
              </span>
              <span className="activity-table-type">{activityTypeLabel(a.activity_type)}</span>
              <span className="activity-table-when checkin-row-mono">{when}</span>
              <span className={`activity-table-state activity-state-${tone}`}>{state}</span>
              <span className="activity-table-event" title={a.event || undefined}>
                {a.event}
              </span>
            </button>
          ))}
        </div>
      )}
      {rows.length > shown && (
        <button className="link-button" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({rows.length - shown})
        </button>
      )}
    </div>
  );
}
