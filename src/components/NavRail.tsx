import { TABS, type Activity, type Tab } from "../types";
import { TAB_ICONS } from "../tabIcons";
import { activityRow, recordText } from "../activityList";
import { isLog } from "../activityTypes";
import { useMinuteClock } from "../hooks/useMinuteClock";
import ActivityTypeIcon from "./ActivityTypeIcon";

/** Tabs that show the focused activity; choosing one in the rail from any other tab goes to Operations. */
const ACTIVITY_TABS: Tab[] = ["Operations", "Check-ins", "Spotter Reports"];

/**
 * What the rail lists under Operations: the nets open now (latest started
 * first), and the focused activity if it isn't one of them.
 */
export function railActivities(activities: Activity[], selectedId: string | null): Activity[] {
  const open = activities
    .filter((a) => a.state === "active" && !isLog(a.activity_type))
    .sort((x, y) => y.opened_at.localeCompare(x.opened_at));
  const selected = activities.find((a) => a.id === selectedId);
  return selected && !open.includes(selected) ? [...open, selected] : open;
}

interface NavRailProps {
  current: Tab;
  onSelect: (tab: Tab) => void;
  /** What a tab is called for the focused activity, where it differs from its name. */
  labels?: Partial<Record<Tab, string>>;
  activities: Activity[];
  selectedActivityId: string | null;
  onSelectActivity: (id: string) => void;
  /** The full Activities list is showing in place of the Operations tab. */
  activityListOpen: boolean;
  onOpenActivityList: () => void;
}

/**
 * The tabs down the left side, with the nets open now under Operations so
 * they're in sight and a click away from any tab, and "All activities" for
 * the rest (search, coming up, closed).
 */
export default function NavRail({
  current,
  onSelect,
  labels = {},
  activities,
  selectedActivityId,
  onSelectActivity,
  activityListOpen,
  onOpenActivityList,
}: NavRailProps) {
  // Ticks each minute, so a net turns amber when its time comes.
  const now = useMinuteClock();
  const listed = railActivities(activities, selectedActivityId);

  const chooseActivity = (id: string) => {
    onSelectActivity(id);
    if (!ACTIVITY_TABS.includes(current)) onSelect("Operations");
    // Back from the full list to the activity itself.
    else if (activityListOpen) onSelect(current);
  };

  return (
    <nav className="nav-rail" aria-label="Tabs">
      <ul className="nav-tabs">
        {TABS.map((t) => {
          const Icon = TAB_ICONS[t];
          const selected = t === current && !(t === "Operations" && activityListOpen);
          return (
            <li key={t}>
              <button
                className={"tab-button" + (selected ? " selected" : "")}
                aria-current={selected ? "page" : undefined}
                onClick={() => onSelect(t)}
              >
                <Icon className="tab-icon" />
                {labels[t] ?? t}
              </button>
              {t === "Operations" && activities.length > 0 && (
                <div className="nav-activities">
                  {listed.length > 0 && (
                    <ul className="activity-list" aria-label="Open activities">
                      {listed.map((a) => {
                        const { state, tone } = activityRow(a, now);
                        const count = a.record_count > 0 ? recordText(a) : "";
                        const isSelected = a.id === selectedActivityId;
                        return (
                          <li key={a.id}>
                            <button
                              className={"activity-row" + (isSelected ? " selected" : "")}
                              aria-current={isSelected || undefined}
                              title={a.title}
                              onClick={() => chooseActivity(a.id)}
                            >
                              <span className="activity-row-line">
                                <ActivityTypeIcon type={a.activity_type} />
                                <span className="activity-row-title">{a.title}</span>
                              </span>
                              <span className="activity-row-detail">
                                <span className={`activity-state-${tone}`}>{state}</span>
                                {count && ` · ${count}`}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <button
                    className={"nav-activities-all" + (activityListOpen ? " selected" : "")}
                    aria-current={activityListOpen ? "page" : undefined}
                    onClick={onOpenActivityList}
                  >
                    All activities…
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
