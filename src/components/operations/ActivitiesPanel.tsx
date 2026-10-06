import { useState } from "react";
import type { Activity } from "../../types";
import { isLog } from "../../activityTypes";
import { activitySections, recordText, searchActivities, type ActivityRow } from "../../activityList";
import { useMinuteClock } from "../../hooks/useMinuteClock";
import { mhzFromText } from "../../bands";
import ActivityTypeIcon from "../ActivityTypeIcon";
import BandChip from "../BandChip";
import { ListChecks } from "lucide-react";

/** Rows shown in a section before "Show more", so years of closed nets don't make a wall. */
const PAGE = 25;
const FOLDS_KEY = "roc-activities-folded";

/** The sections folded (true) or opened (false) on this computer; others use their default. */
function loadFolds(): Record<string, boolean> {
  try {
    const v = localStorage.getItem(FOLDS_KEY);
    return v ? (JSON.parse(v) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveFolds(folds: Record<string, boolean>) {
  try {
    localStorage.setItem(FOLDS_KEY, JSON.stringify(folds));
  } catch {
    // Still applies for this session.
  }
}

/** One activity on a line: type icon and name, band, when, how many records, state; its event when searching. */
function Row({
  row: { activity: a, when, state, tone },
  selected,
  showEvent,
  onSelect,
}: {
  row: ActivityRow;
  selected: boolean;
  showEvent: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        className={"activity-table-row" + (showEvent ? " activity-table-row-event" : "") + (selected ? " selected" : "")}
        aria-current={selected || undefined}
        onClick={() => onSelect(a.id)}
      >
        <span className="activity-table-name">
          <ActivityTypeIcon type={a.activity_type} />
          <span className="activity-table-title">{a.title}</span>
        </span>
        <span className="activity-table-band">
          <BandChip mhz={mhzFromText(a.frequency)} />
        </span>
        <span className="activity-table-when checkin-row-mono">{when}</span>
        <span className={"activity-table-count" + (a.record_count === 0 ? " activity-table-none" : "")}>
          {isLog(a.activity_type) && a.state !== "closed" && a.record_count === 0 ? "" : recordText(a)}
        </span>
        <span className={`activity-table-state activity-state-${tone}`}>{state}</span>
        {showEvent && (
          <span className="activity-table-event" title={a.event || undefined}>
            {a.event}
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * Every activity at the top of the Operations tab, in sections in the order
 * things happen (UX-OPS-015): open now, each event as a block in running
 * order, coming up, station logs, and earlier (folded). Clicking one selects
 * it for the panels below; the top bar's Activity list stays the quick way to
 * switch from any tab.
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
  const [query, setQuery] = useState("");
  const [folds, setFolds] = useState<Record<string, boolean>>(loadFolds);
  // Rows shown per section, past the first page.
  const [shown, setShown] = useState<Record<string, number>>({});
  // Ticks each minute, so a net turns amber when its time comes.
  const now = useMinuteClock();
  const searching = query.trim() !== "";
  const sections = activitySections(activities, now);
  const results = searchActivities(activities, query, now);
  const selected = activities.find((a) => a.id === selectedActivityId) ?? null;

  function toggle(id: string, open: boolean) {
    setFolds((prev) => {
      const next = { ...prev, [id]: !open };
      saveFolds(next);
      return next;
    });
  }

  const rowsOf = (rows: ActivityRow[], key: string, showEvent: boolean) => {
    const limit = shown[key] ?? PAGE;
    return (
      <>
        <ul className="activity-table" aria-label={key === "search" ? "Search results" : undefined}>
          {rows.slice(0, limit).map((r) => (
            <Row
              key={r.activity.id}
              row={r}
              selected={r.activity.id === selectedActivityId}
              showEvent={showEvent}
              onSelect={onSelectActivity}
            />
          ))}
        </ul>
        {rows.length > limit && (
          <button className="link-button" onClick={() => setShown((s) => ({ ...s, [key]: limit + PAGE }))}>
            Show more ({rows.length - limit})
          </button>
        )}
      </>
    );
  };

  return (
    <div className="panel activities-panel">
      <div className="panel-header-row">
        <h3>
          <ListChecks className="heading-icon" />
          Activities
        </h3>
        <div className="checkin-roster-header-actions">
          {activities.length > 0 && (
            <input
              type="search"
              className="checkin-roster-search activities-search"
              aria-label="Search activities"
              placeholder="Search activities"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <button className="primary" onClick={onNewActivity}>
            + New activity
          </button>
        </div>
      </div>

      {activities.length === 0 && <p className="checkin-empty-state">No activities yet — start with + New activity.</p>}

      {searching ? (
        results.length === 0 ? (
          <p className="checkin-empty-state">No activities match “{query.trim()}”.</p>
        ) : (
          <section className="activity-section" aria-label="Search results">
            <h4 className="activity-section-heading">
              {results.length} found <span className="activity-section-summary">by name, event, type, or frequency</span>
            </h4>
            {rowsOf(results, "search", true)}
          </section>
        )
      ) : (
        sections.map((s) => {
          // A folded section holding the selected activity opens, so it's never out of sight.
          const holdsSelected = s.rows.some((r) => r.activity.id === selectedActivityId);
          const open = holdsSelected || !(folds[s.id] ?? s.folded);
          const event = s.id.startsWith("event:");
          return (
            <details
              key={s.id}
              className={"activity-section" + (event ? " activity-section-event" : "")}
              open={open}
              onToggle={(e) => {
                const nowOpen = (e.currentTarget as HTMLDetailsElement).open;
                if (nowOpen !== open) toggle(s.id, nowOpen);
              }}
            >
              <summary className={"activity-section-heading" + (s.live ? " activity-section-live" : "")}>
                {s.title}
                <span className="activity-section-summary">
                  {s.summary ? ` · ${s.summary}` : ` (${s.rows.length})`}
                </span>
              </summary>
              {rowsOf(s.rows, s.id, false)}
            </details>
          );
        })
      )}

      {searching && selected && !results.some((r) => r.activity.id === selected.id) && (
        <p className="activity-table-selected">
          Selected: <strong>{selected.title}</strong>, not in these results.{" "}
          <button className="link-button" onClick={() => setQuery("")}>
            Clear search
          </button>
        </p>
      )}
    </div>
  );
}
