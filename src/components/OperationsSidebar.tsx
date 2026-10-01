import { useState } from "react";
import type { Activity } from "../types";
import { isLog } from "../activityTypes";
import { pad2, splitScheduledAt } from "../utils";
import { ListChecks } from "lucide-react";

interface OperationsSidebarProps {
  activities: Activity[];
  selectedActivityId: string | null;
  onSelectActivity: (id: string) => void;
}

export type GroupId = "open" | "logs" | "upcoming" | "closed";

export const GROUP_LABELS: Record<GroupId, string> = {
  open: "Open now",
  logs: "Station logs",
  upcoming: "Upcoming",
  closed: "Closed",
};

/** Folded until the operator opens them. */
const COLLAPSED_BY_DEFAULT: GroupId[] = ["closed"];
const COLLAPSED_KEY = "roc-sidebar-collapsed";

export interface SidebarRow {
  activity: Activity;
  /** What the row says, e.g. "Tue 10/6 19:00 — Tuesday Net". */
  label: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Tue 10/6", with the year when it isn't this year. */
function shortDate(d: Date, now: Date): string {
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const year = d.getFullYear() === now.getFullYear() ? "" : `/${d.getFullYear()}`;
  return `${WEEKDAYS[d.getDay()]} ${md}${year}`;
}

/** An activity's scheduled date and time, short ("Tue 10/6 19:00"); "" if none. */
function scheduledLabel(a: Activity, now: Date): string {
  const { date, time } = splitScheduledAt(a.scheduled_at);
  if (!date) return "";
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const day = m ? shortDate(new Date(+m[1], +m[2] - 1, +m[3]), now) : date;
  return time ? `${day} ${time}` : day;
}

/** When a stored timestamp was, short ("Tue 9/29"), or "" if unreadable. */
function stampDate(iso: string, now: Date): string {
  const d = new Date(iso);
  return iso && !Number.isNaN(d.getTime()) ? shortDate(d, now) : "";
}

function stampTime(iso: string): string {
  const d = new Date(iso);
  return iso && !Number.isNaN(d.getTime()) ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : "";
}

const withPrefix = (prefix: string, title: string) => (prefix ? `${prefix} — ${title}` : title);

/**
 * The sidebar's groups, in display order, by what's happening now rather
 * than by date: nets running now; station logs (ongoing, never started or
 * ended); nets not started yet, soonest first (undated ones after); closed
 * nets, most recently closed first. Empty groups are left out. `filter`
 * keeps only activities whose title contains it (ignoring case).
 */
export function groupActivities(
  activities: Activity[],
  filter = "",
  now: Date = new Date()
): [GroupId, SidebarRow[]][] {
  const q = filter.trim().toLowerCase();
  const shown = q ? activities.filter((a) => a.title.toLowerCase().includes(q)) : activities;
  const groups: Record<GroupId, SidebarRow[]> = { open: [], logs: [], upcoming: [], closed: [] };

  const logs = shown.filter((a) => isLog(a.activity_type));
  const nets = shown.filter((a) => !isLog(a.activity_type));

  for (const a of [...logs].sort((x, y) => x.title.localeCompare(y.title))) {
    groups.logs.push({ activity: a, label: a.state === "closed" ? `${a.title} (closed)` : a.title });
  }
  for (const a of nets.filter((a) => a.state === "active")) {
    const since = stampTime(a.opened_at);
    groups.open.push({ activity: a, label: since ? `${a.title} (since ${since})` : a.title });
  }
  // Soonest first; undated ones last, alphabetically.
  const upcoming = nets
    .filter((a) => a.state === "scheduled")
    .sort((x, y) => {
      const [dx, dy] = [x.scheduled_at.trim(), y.scheduled_at.trim()];
      if (!dx !== !dy) return dx ? -1 : 1;
      return dx === dy ? x.title.localeCompare(y.title) : dx < dy ? -1 : 1;
    });
  for (const a of upcoming) {
    groups.upcoming.push({ activity: a, label: withPrefix(scheduledLabel(a, now), a.title) });
  }
  // Most recently closed first (by when it closed, else when it was scheduled).
  const closedAt = (a: Activity) => a.closed_at || a.scheduled_at;
  const closed = nets
    .filter((a) => a.state === "closed")
    .sort((x, y) => (closedAt(x) < closedAt(y) ? 1 : closedAt(x) > closedAt(y) ? -1 : 0));
  for (const a of closed) {
    const when = stampDate(a.closed_at, now) || scheduledLabel(a, now);
    groups.closed.push({ activity: a, label: withPrefix(when, a.title) });
  }

  return (["open", "logs", "upcoming", "closed"] as GroupId[])
    .filter((id) => groups[id].length > 0)
    .map((id) => [id, groups[id]]);
}

function loadCollapsed(): Set<GroupId> {
  try {
    const v = localStorage.getItem(COLLAPSED_KEY);
    if (v) return new Set(JSON.parse(v) as GroupId[]);
  } catch {
    // Storage unavailable or unreadable: use the defaults.
  }
  return new Set(COLLAPSED_BY_DEFAULT);
}

function saveCollapsed(collapsed: Set<GroupId>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Still applies for this session.
  }
}

export default function OperationsSidebar({
  activities,
  selectedActivityId,
  onSelectActivity,
}: OperationsSidebarProps) {
  const [filter, setFilter] = useState("");
  // Which groups are folded, remembered on this computer.
  const [collapsed, setCollapsed] = useState<Set<GroupId>>(loadCollapsed);
  const filtering = filter.trim() !== "";
  const groups = groupActivities(activities, filter);

  function toggle(id: GroupId, open: boolean) {
    // While filtering every group is shown open; that isn't a choice to remember.
    if (filtering) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (open) next.delete(id);
      else next.add(id);
      saveCollapsed(next);
      return next;
    });
  }

  return (
    <aside className="ops-sidebar">
      <div className="panel">
        <h3>
          <ListChecks className="heading-icon" />
          Activities
        </h3>
        {activities.length === 0 ? (
          <p className="checkin-empty-state">No activities yet. Create one in the main window.</p>
        ) : (
          <input
            type="search"
            className="sidebar-filter"
            aria-label="Filter activities"
            placeholder="Filter by title"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
        {filtering && groups.length === 0 && (
          <p className="checkin-empty-state">No activities match “{filter.trim()}”.</p>
        )}
        {groups.map(([id, rows]) => (
          <details
            key={id}
            open={filtering || !collapsed.has(id)}
            onToggle={(e) => toggle(id, (e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary>
              {GROUP_LABELS[id]} <span className="sidebar-count">({rows.length})</span>
            </summary>
            {rows.map(({ activity: a, label }) => (
              <div
                key={a.id}
                className={"selectable" + (selectedActivityId === a.id ? " selected" : "")}
                onClick={() => onSelectActivity(a.id)}
              >
                {label}
              </div>
            ))}
          </details>
        ))}
      </div>
    </aside>
  );
}
