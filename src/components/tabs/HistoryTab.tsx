import { Fragment, useEffect, useState } from "react";
import * as api from "../../api";
import type { HistoryEntry, Operator } from "../../types";
import { describeHistory, historyKind, historyPlain, type Seg } from "../../historyText";
import { pad2 } from "../../utils";
import {
  BookUser,
  CalendarRange,
  ClipboardPen,
  History,
  Radio,
  RadioTower,
  Send,
  UserRound,
  type LucideIcon,
} from "lucide-react";

/** Events fetched at a time; Show older fetches the next lot. */
const PAGE = 200;

const KIND_ICONS: Record<ReturnType<typeof historyKind>, { icon: LucideIcon; label: string }> = {
  net: { icon: Radio, label: "Activity" },
  station: { icon: BookUser, label: "Check-in" },
  report: { icon: ClipboardPen, label: "Spotter report" },
  message: { icon: Send, label: "Relay message" },
  directory: { icon: RadioTower, label: "Repeater, net listing, or place" },
  event: { icon: CalendarRange, label: "Event or ICS 214" },
  operator: { icon: UserRound, label: "Operator" },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Today · Mon 10/5", "Yesterday · Sun 10/4", "Fri 10/2", with the year when it isn't this year. */
export function dayLabel(d: Date, now = new Date()): string {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const year = d.getFullYear() === now.getFullYear() ? "" : `/${d.getFullYear()}`;
  const name = `${WEEKDAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}${year}`;
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  return diff === 0 ? `Today · ${name}` : diff === 1 ? `Yesterday · ${name}` : name;
}

/** "Logan (W0LAB / WRMN479)" -> "W0LAB / WRMN479": who did it, briefly; the name is on hovering. */
export function callOf(operator: string): string {
  return operator.match(/\(([^)]+)\)\s*$/)?.[1] ?? operator;
}

function Sentence({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) =>
        typeof s === "string" ? <Fragment key={i}>{s}</Fragment> : <strong key={i}>{s.name}</strong>
      )}
    </>
  );
}

/**
 * Everything done in the app, newest first, in words (AUDIT-020): what
 * happened, to what, in which activity, by whom, and when — grouped by day,
 * searchable, with older ones on request.
 */
export default function HistoryTab({
  operators,
  onOpenActivity,
}: {
  operators: Operator[];
  /** Goes to an activity on the Operations tab. */
  onOpenActivity: (id: string) => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Retired operators too, so a change of who ran a net names them.
  const [retired, setRetired] = useState<Operator[]>([]);

  useEffect(() => {
    api
      .listHistory(limit)
      .then((e) => {
        setEntries(e);
        setLoaded(true);
      })
      .catch((e) => setError(String(e)));
  }, [limit]);
  useEffect(() => {
    api.listRetiredOperators().then(setRetired).catch(() => setRetired([]));
  }, []);

  const opName = (id: string) => {
    const o = [...operators, ...retired].find((x) => x.id === id);
    return o ? o.call_sign || o.display_name : null;
  };

  const q = query.trim().toLowerCase();
  const lines = entries
    .map((e) => ({ e, segs: describeHistory(e, opName) }))
    .filter(
      ({ e, segs }) =>
        !q || [historyPlain(segs), e.activity_title, e.operator].some((v) => v.toLowerCase().includes(q))
    );

  // Grouped by local day, newest first (the list already is).
  const days: { label: string; lines: typeof lines }[] = [];
  for (const line of lines) {
    const label = dayLabel(new Date(line.e.created_at));
    if (days.length === 0 || days[days.length - 1].label !== label) days.push({ label, lines: [] });
    days[days.length - 1].lines.push(line);
  }

  return (
    <div className="panel history-panel">
      <div className="panel-header-row">
        <h3>
          <History className="heading-icon" />
          History
        </h3>
        <div className="checkin-roster-header-actions">
          {entries.length > 0 && (
            <input
              type="search"
              className="checkin-roster-search"
              aria-label="Search history"
              placeholder="Search history"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </div>
      </div>
      <p className="settings-hint">
        Everything done in the app, newest first: nets started and ended, check-ins corrected or removed, traffic
        handled, relays passed, and changes to repeaters, nets, places, and operators. An activity's own history can
        be saved from its Exports &amp; forms.
      </p>
      {error && <p className="weather-area-error">Couldn't load the history: {error}</p>}
      {loaded && entries.length === 0 && <p className="checkin-empty-state">Nothing recorded yet.</p>}
      {entries.length > 0 && lines.length === 0 && (
        <p className="checkin-empty-state">Nothing in the history matches “{query.trim()}”.</p>
      )}
      {days.map((day) => (
        <section key={day.label} className="history-day" aria-label={day.label}>
          <h4 className="net-day-heading">{day.label}</h4>
          <ul className="history-list">
            {day.lines.map(({ e, segs }) => {
              const { icon: Icon, label } = KIND_ICONS[historyKind(e)];
              const t = new Date(e.created_at);
              const isActivity = e.entity_type === "activity";
              return (
                <li key={e.id} className="history-row">
                  <span className="history-time checkin-row-mono">
                    {pad2(t.getHours())}:{pad2(t.getMinutes())}
                  </span>
                  <span className="history-icon" title={label}>
                    <Icon aria-label={label} role="img" />
                  </span>
                  <span className="history-text">
                    <Sentence segs={segs} />
                  </span>
                  <span className="history-activity">
                    {/* The net a check-in, report, or message belongs to; an activity's own events name it already. */}
                    {e.activity_id && e.activity_title && !isActivity && (
                      <button
                        className="link-button"
                        title="Go to this activity"
                        onClick={() => onOpenActivity(e.activity_id)}
                      >
                        {e.activity_title}
                      </button>
                    )}
                  </span>
                  <span className="history-who" title={e.operator || undefined}>
                    {callOf(e.operator)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {entries.length >= limit && (
        <button className="link-button" onClick={() => setLimit((n) => n + PAGE)}>
          Show older
        </button>
      )}
    </div>
  );
}
