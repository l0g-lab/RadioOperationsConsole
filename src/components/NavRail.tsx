import { useRef, useState } from "react";
import { TABS, type Activity, type Tab } from "../types";
import { TAB_ICONS } from "../tabIcons";
import { activityRow, recordText } from "../activityList";
import { isLog } from "../activityTypes";
import { useMinuteClock } from "../hooks/useMinuteClock";
import ActivityTypeIcon from "./ActivityTypeIcon";

/** Tabs that show the focused activity; choosing one in the rail from any other tab goes to Operations. */
const ACTIVITY_TABS: Tab[] = ["Operations", "Check-ins", "Spotter Reports"];

/** The side bar's width: dragged between these, double-click for the default (UX-033). */
export const RAIL_DEFAULT = 320;
export const RAIL_MIN = 180;
export const RAIL_MAX = 480;
const RAIL_STEP = 20;
const WIDTH_KEY = "roc-nav-rail-width";

const clampWidth = (w: number) => Math.round(Math.min(RAIL_MAX, Math.max(RAIL_MIN, w)));

/** The width set on this computer, or the default. */
function loadWidth(): number {
  try {
    const w = parseFloat(localStorage.getItem(WIDTH_KEY) ?? "");
    return Number.isFinite(w) ? clampWidth(w) : RAIL_DEFAULT;
  } catch {
    return RAIL_DEFAULT;
  }
}

function saveWidth(w: number) {
  try {
    localStorage.setItem(WIDTH_KEY, String(w));
  } catch {
    // Still applies for this session.
  }
}

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
  const [width, setWidth] = useState(loadWidth);
  // Where a drag of the edge started: the pointer's x and the width then.
  const drag = useRef<{ x: number; width: number } | null>(null);
  const resize = (w: number) => {
    const next = clampWidth(w);
    setWidth(next);
    saveWidth(next);
  };

  const chooseActivity = (id: string) => {
    onSelectActivity(id);
    if (!ACTIVITY_TABS.includes(current)) onSelect("Operations");
    // Back from the full list to the activity itself.
    else if (activityListOpen) onSelect(current);
  };

  return (
    <div className="nav-rail-wrap" style={{ width }}>
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
      <div
        className="nav-rail-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Side bar width"
        aria-valuenow={width}
        aria-valuemin={RAIL_MIN}
        aria-valuemax={RAIL_MAX}
        tabIndex={0}
        title="Drag to resize; double-click for the default"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, width };
        }}
        onPointerMove={(e) => {
          if (drag.current) setWidth(clampWidth(drag.current.width + e.clientX - drag.current.x));
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          resize(drag.current.width + e.clientX - drag.current.x);
          drag.current = null;
        }}
        onDoubleClick={() => resize(RAIL_DEFAULT)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            resize(width + (e.key === "ArrowRight" ? RAIL_STEP : -RAIL_STEP));
          } else if (e.key === "Home" || e.key === "End") {
            e.preventDefault();
            resize(e.key === "End" ? RAIL_MAX : RAIL_MIN);
          }
        }}
      />
    </div>
  );
}
