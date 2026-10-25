import { useState } from "react";
import type { Activity } from "../../types";
import { activitySections, recordText, searchActivities, type ActivityRow } from "../../activityList";
import { useMinuteClock } from "../../hooks/useMinuteClock";
import { mhzFromText } from "../../bands";
import { activityTypeLabel } from "../../activityTypes";
import ActivityTypeIcon from "../ActivityTypeIcon";
import BandChip from "../BandChip";
import { ChevronDown, ChevronRight, ListChecks } from "lucide-react";

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

const COLUMNS = ["Name", "State", "Type", "Frequency", "When", "Records"];

/**
 * One activity as a table row: its type icon and name (a button, so it's
 * reachable and announced as one; the event too when searching), state
 * (open in green, due in amber), type, band and frequency, when, and how
 * many records. A click anywhere on the row selects it.
 */
function Row({
  row: { activity: a, when, state, tone, ago },
  selected,
  showEvent,
  onSelect,
}: {
  row: ActivityRow;
  selected: boolean;
  showEvent: boolean;
  onSelect: (id: string) => void;
}) {
  // A count once there's something to count, or once it's closed (0 then is worth seeing: often a test run).
  const count = a.record_count > 0 || a.state === "closed" ? recordText(a) : "";
  return (
    <tr className={"activity-table-row" + (selected ? " selected" : "")} onClick={() => onSelect(a.id)}>
      <td className="activity-table-name">
        <button className="activity-name-button" aria-current={selected || undefined} title={a.title}>
          <ActivityTypeIcon type={a.activity_type} />
          <span className="activity-row-title">{a.title}</span>
        </button>
        {showEvent && a.event && <span className="activity-table-event">{a.event}</span>}
      </td>
      <td className={`activity-state-${tone}`}>{state}</td>
      <td>{activityTypeLabel(a.activity_type)}</td>
      <td>
        <BandChip mhz={mhzFromText(a.frequency)} keepSpace />
        {a.frequency}
      </td>
      <td>
        {when}
        {ago && <span className="activity-state-due"> · {ago}</span>}
      </td>
      <td>{count}</td>
    </tr>
  );
}

/**
 * Every activity, under All activities in the side bar (UX-OPS-015,
 * UX-032), as one table across the page, in sections in the order things
 * happen: open now, each event as a block in running order, coming up,
 * station logs, and closed (folded). Clicking one selects it; the side bar's
 * open nets and the top bar's Activity list stay the quick ways to switch
 * from any tab.
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
        {rows.slice(0, limit).map((r) => (
          <Row
            key={r.activity.id}
            row={r}
            selected={r.activity.id === selectedActivityId}
            showEvent={showEvent}
            onSelect={onSelectActivity}
          />
        ))}
        {rows.length > limit && (
          <tr>
            <td colSpan={COLUMNS.length}>
              <button className="link-button" onClick={() => setShown((s) => ({ ...s, [key]: limit + PAGE }))}>
                Show more ({rows.length - limit})
              </button>
            </td>
          </tr>
        )}
      </>
    );
  };

  const hasRows = searching ? results.length > 0 : sections.length > 0;

  return (
    <div className="panel activities-panel">
      <div className="panel-header-row">
        <h3>
          <ListChecks className="heading-icon" />
          Activities
        </h3>
        <button className="primary activities-new" onClick={onNewActivity} title="New activity">
          + New
        </button>
      </div>
      {activities.length > 0 && (
        <input
          type="search"
          className="activities-search"
          aria-label="Search activities"
          placeholder="Search name, event, type, frequency"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {activities.length === 0 && <p className="checkin-empty-state">No activities yet — start with + New activity.</p>}
      {searching && results.length === 0 && (
        <p className="checkin-empty-state">No activities match “{query.trim()}”.</p>
      )}

      {hasRows && (
        <table className="activities-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          {searching ? (
            <tbody aria-label="Search results">
              <tr className="activity-section-row">
                <th colSpan={COLUMNS.length} scope="colgroup" className="activity-section-heading">
                  {results.length} found
                </th>
              </tr>
              {rowsOf(results, "search", true)}
            </tbody>
          ) : (
            sections.map((s) => {
              // A folded section holding the selected activity opens, so it's never out of sight.
              const holdsSelected = s.rows.some((r) => r.activity.id === selectedActivityId);
              const open = holdsSelected || !(folds[s.id] ?? s.folded);
              const event = s.id.startsWith("event:");
              const Chevron = open ? ChevronDown : ChevronRight;
              return (
                <tbody key={s.id} className={event ? "activity-section-event" : undefined}>
                  <tr className="activity-section-row">
                    <th colSpan={COLUMNS.length} scope="colgroup">
                      <button
                        className={"activity-section-heading" + (s.live ? " activity-section-live" : "")}
                        aria-expanded={open}
                        onClick={() => toggle(s.id, !open)}
                      >
                        <Chevron className="activity-section-chevron" aria-hidden />
                        {s.title}
                        {s.summary ? (
                          <span className="activity-section-summary"> · {s.summary}</span>
                        ) : (
                          <span className="activity-section-summary"> ({s.rows.length})</span>
                        )}
                      </button>
                    </th>
                  </tr>
                  {open && rowsOf(s.rows, s.id, false)}
                </tbody>
              );
            })
          )}
        </table>
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
