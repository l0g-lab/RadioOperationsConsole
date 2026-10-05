import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, EventRecord, Operator } from "../../types";
import { activityTypeLabel, isLog } from "../../activityTypes";
import { eventSpan, eventStatus, startMs } from "../../events";
import { localDate, localTime } from "../../icsForms";
import Ics214Dialog from "../exports/Ics214Dialog";
import IcsFormDialog from "../exports/IcsFormDialog";
import { CalendarRange, ClipboardList, FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import ActivityTypeIcon from "../ActivityTypeIcon";
import BandChip from "../BandChip";
import { mhzFromText } from "../../bands";

interface Props {
  events: EventRecord[];
  activities: Activity[];
  operators: Operator[];
  /** Who's named on the event's forms, and recorded as making changes here. */
  defaultOperatorId: string | null;
  onEventsChanged: () => void;
  onActivitiesChanged: () => void;
  /** Goes to an activity: selects it and shows it. */
  onOpenActivity: (id: string) => void;
  /** Opens the New Activity form set to this event. */
  onAddActivity: (eventId: string) => void;
}

const STATUS_LABEL = { upcoming: "Upcoming", on: "Under way", finished: "Finished", empty: "No activities yet" };

/** "Sat 10/4 09:00", or "" if unknown. */
function when(ms: number | null): string {
  if (ms == null) return "";
  // As the Activities table shows it, whatever the computer's regional settings.
  const d = new Date(ms);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `${weekday} ${d.getMonth() + 1}/${d.getDate()} ${localTime(d)}`;
}

/** An event's dates for the list: its activities' span, else its own date. */
function datesOf(ev: EventRecord, acts: Activity[]): string {
  // YYYY-MM-DD, as dates are shown everywhere else, whether worked out or typed.
  const span = eventSpan(acts);
  if (span) {
    const [a, b] = [localDate(new Date(span.from)), localDate(new Date(span.to))];
    return a === b ? a : `${a} – ${b}`;
  }
  return ev.date;
}

/**
 * Events (docs/features/events.md): each occasion — say an exercise — in one
 * place, with its activities in the order they run, ways to add to it, and
 * the forms that cover all of it: its ICS 214 activity log, and one ICS 309.
 */
export default function EventsTab({
  events,
  activities,
  operators,
  defaultOperatorId,
  onEventsChanged,
  onActivitiesChanged,
  onOpenActivity,
  onAddActivity,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; name: string; date: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<"214" | "309" | "logs" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const of = (id: string) => activities.filter((a) => a.event_id === id);
  // Events under way or coming up first, then finished ones, latest first.
  const order = { on: 0, upcoming: 1, empty: 2, finished: 3 };
  const sorted = [...events].sort((x, y) => {
    const [sx, sy] = [eventStatus(of(x.id)), eventStatus(of(y.id))];
    if (sx !== sy) return order[sx] - order[sy];
    const [tx, ty] = [eventSpan(of(x.id))?.from ?? x.date, eventSpan(of(y.id))?.from ?? y.date];
    return sx === "finished" ? ty.localeCompare(tx) : tx.localeCompare(ty);
  });
  const selected = events.find((e) => e.id === selectedId) ?? sorted[0] ?? null;
  const acts = selected
    ? [...of(selected.id)].sort((x, y) => (startMs(x) ?? Infinity) - (startMs(y) ?? Infinity))
    : [];
  const free = activities.filter((a) => !a.event_id && !isLog(a.activity_type));
  const defaultOperator = operators.find((o) => o.id === defaultOperatorId) ?? null;

  useEffect(() => {
    setDeleting(false);
    setError(null);
  }, [selected?.id]);

  async function saveEvent() {
    if (!editing) return;
    try {
      const id = await api.saveEvent(editing.id, editing.name, editing.date, defaultOperatorId);
      setEditing(null);
      setSelectedId(id);
      onEventsChanged();
      onActivitiesChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  async function removeEvent() {
    if (!selected) return;
    try {
      await api.deleteEvent(selected.id, defaultOperatorId);
      setSelectedId(null);
      onEventsChanged();
      onActivitiesChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  async function setEvent(activityId: string, eventId: string | null) {
    try {
      const a = activities.find((x) => x.id === activityId);
      await api.setActivityEvent(activityId, eventId, a?.operator_id || defaultOperatorId);
      onActivitiesChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  const eventForm = (
    <div
      className="inline-form event-form"
      onKeyDown={(e) => {
        if (e.key === "Enter") saveEvent();
        if (e.key === "Escape") setEditing(null);
      }}
    >
      <label className="activity-field activity-field-wide">
        <span className="activity-field-label">Name</span>
        <input
          autoFocus
          placeholder="e.g. ARRL 2026 SET"
          value={editing?.name ?? ""}
          onChange={(e) => editing && setEditing({ ...editing, name: e.target.value })}
        />
      </label>
      <label className="activity-field">
        <span className="activity-field-label">Date (optional)</span>
        <input
          placeholder="YYYY-MM-DD"
          value={editing?.date ?? ""}
          onChange={(e) => editing && setEditing({ ...editing, date: e.target.value })}
        />
      </label>
      <button className="primary" onClick={saveEvent}>
        {editing?.id ? "Save" : "Create event"}
      </button>
      <button onClick={() => setEditing(null)}>Cancel</button>
    </div>
  );

  return (
    <div className="events-workspace">
      <div className="panel events-list">
        <div className="panel-header-row">
          <h3>
            <CalendarRange className="heading-icon" />
            Events
          </h3>
          {!editing && (
            <button className="primary" onClick={() => setEditing({ id: null, name: "", date: "" })}>
              + New event
            </button>
          )}
        </div>
        {editing && !editing.id && eventForm}
        {events.length === 0 && !editing && (
          <p className="checkin-empty-state">
            No events yet. An event groups the activities of one occasion — say the nets and relays of
            a SET — so you can follow them in order and send one activity log (ICS 214) for it all.
          </p>
        )}
        {sorted.map((ev) => {
          const list = of(ev.id);
          return (
            <div
              key={ev.id}
              className={"selectable event-row" + (selected?.id === ev.id ? " selected" : "")}
              onClick={() => setSelectedId(ev.id)}
            >
              <strong>{ev.name}</strong>
              <span className="settings-hint">
                {[datesOf(ev, list), STATUS_LABEL[eventStatus(list)], `${list.length} ${list.length === 1 ? "activity" : "activities"}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          );
        })}
        <p className="settings-hint events-other-logs">
          <button className="link-button" onClick={() => setForm("logs")}>
            All activity logs (ICS 214)…
          </button>
        </p>
      </div>

      {selected && (
        <div className="panel events-detail">
          {editing?.id === selected.id ? (
            eventForm
          ) : (
            <div className="panel-header-row">
              <h3>
                <CalendarRange className="heading-icon" />
                {selected.name}
                <span className="settings-hint event-detail-dates">
                  {" "}
                  {[datesOf(selected, acts), STATUS_LABEL[eventStatus(acts)]].filter(Boolean).join(" · ")}
                </span>
              </h3>
              <span className="operator-row-actions operator-row-icons">
                <button
                  className="icon-button"
                  aria-label={`Rename ${selected.name}`}
                  title="Rename or change the date"
                  onClick={() => setEditing({ id: selected.id, name: selected.name, date: selected.date })}
                >
                  <Pencil />
                </button>
                <button
                  className="icon-button danger-link"
                  aria-label={`Delete ${selected.name}`}
                  title="Delete the event (its activities and activity log are kept)"
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 />
                </button>
              </span>
            </div>
          )}
          {deleting && (
            <div className="confirm-row">
              <p>
                Delete the event “{selected.name}”? Its {acts.length} activities and its activity log
                are kept, just no longer part of an event.
              </p>
              <div className="inline-form">
                <button className="danger" onClick={removeEvent}>
                  Delete event
                </button>
                <button onClick={() => setDeleting(false)}>Cancel</button>
              </div>
            </div>
          )}

          <h4 className="export-section-title">Activities, in the order they run</h4>
          {acts.length === 0 && <p className="checkin-empty-state">None yet — add the first below.</p>}
          <div className="event-timeline">
            {acts.map((a) => (
              <div key={a.id} className="event-timeline-row">
                <span className="relay-time">{when(startMs(a)) || "—"}</span>
                <span className="event-timeline-title">
                  <ActivityTypeIcon type={a.activity_type} />
                  <button className="link-button" onClick={() => onOpenActivity(a.id)} title="Go to this activity">
                    {a.title}
                  </button>
                </span>
                <span className="settings-hint event-timeline-detail">
                  {activityTypeLabel(a.activity_type)}
                  {a.frequency && (
                    <>
                      {" · "}
                      <BandChip mhz={mhzFromText(a.frequency)} />
                      {a.frequency}
                    </>
                  )}
                </span>
                <span className={`event-state event-state-${a.state}`}>
                  {a.state === "active" ? "Open" : a.state === "closed" ? "Closed" : "Not started"}
                </span>
                <button
                  className="icon-button"
                  aria-label={`Take ${a.title} out of ${selected.name}`}
                  title="Take it out of this event (the activity is kept)"
                  onClick={() => setEvent(a.id, null)}
                >
                  <X />
                </button>
              </div>
            ))}
          </div>
          <div className="inline-form">
            <button onClick={() => onAddActivity(selected.id)}>
              <Plus className="button-icon" /> New activity in this event
            </button>
            {free.length > 0 && (
              <select
                aria-label="Add an existing activity"
                value=""
                onChange={(e) => e.target.value && setEvent(e.target.value, selected.id)}
              >
                <option value="">Add an existing activity…</option>
                {free.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                    {a.scheduled_at ? ` — ${a.scheduled_at}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <h4 className="export-section-title">Forms for the whole event</h4>
          <div className="export-row">
            <div className="export-row-info">
              <strong>ICS 214 — Activity Log</strong>
              <div className="settings-hint">
                What you did across the event, filled in from every activity in it, with anything you
                add. Kept, so your edits are there next time.
              </div>
            </div>
            <div className="inline-form">
              <button onClick={() => setForm("214")}>
                <ClipboardList className="button-icon" /> Open…
              </button>
            </div>
          </div>
          <div className="export-row">
            <div className="export-row-info">
              <strong>ICS 309 — Communications Log</strong>
              <div className="settings-hint">
                Every net's check-ins and every relayed message in one log, oldest first. Leave any
                activity out. (Each activity's own 309 is with it on the Operations tab.)
              </div>
            </div>
            <div className="inline-form">
              <button
                disabled={acts.length === 0}
                title={acts.length === 0 ? "Add an activity first" : undefined}
                onClick={() => setForm("309")}
              >
                <FileText className="button-icon" /> Open…
              </button>
            </div>
          </div>
          {error && <p className="weather-area-error">{error}</p>}
        </div>
      )}

      {form === "214" && selected && (
        <Ics214Dialog
          operator={defaultOperator}
          event={{ id: selected.id, name: selected.name, activities: acts }}
          onClose={() => setForm(null)}
        />
      )}
      {form === "logs" && <Ics214Dialog operator={defaultOperator} onClose={() => setForm(null)} />}
      {form === "309" && selected && acts.length > 0 && (
        <IcsFormDialog
          form="309"
          activity={acts[0]}
          event={{ name: selected.name, activities: acts }}
          callFor={(a) => {
            const o = operators.find((x) => x.id === a.operator_id);
            return o?.call_sign || o?.display_name || "";
          }}
          // One log for the event goes out under the default operator; editable here and in Winlink.
          operatorName={defaultOperator?.display_name ?? ""}
          operatorCall={defaultOperator?.call_sign ?? ""}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
