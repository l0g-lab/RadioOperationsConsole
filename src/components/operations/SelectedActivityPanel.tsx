import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, EventRecord, Operator, Repeater } from "../../types";
import ActivitySummaryPanel from "./ActivitySummaryPanel";
import type { ActivityRepeater } from "./ActivityRepeaterField";
import ActivityForm, { type ActivityDraft } from "./ActivityForm";
import { operatorPlace } from "./CreateActivityPanel";
import { activityTypeLabel, isLog, isRangeCheck } from "../../activityTypes";
import DeleteActivityDialog from "../lifecycle/DeleteActivityDialog";
import { formatCoordsWithGrid } from "../../geo";
import { combineScheduledAt, formatContactTime, parseContactTime, splitScheduledAt } from "../../utils";
import { SquarePen } from "lucide-react";

interface Props {
  activities: Activity[];
  selectedActivityId: string | null;
  selectedOperatorId: string | null;
  onActivitiesChanged: () => void;
  /** True when the top bar's Edit link was clicked: open the edit form straight away. */
  editRequested: boolean;
  onEditRequestHandled: () => void;
  /** The repeater directory, to pick from. */
  repeaters: Repeater[];
  /** To choose who runs the activity. */
  operators: Operator[];
  /** The events there are, to move the activity into or out of one. */
  events?: EventRecord[];
}

/**
 * Edit, delete, and per-activity location controls for the selected
 * activity. Which activity is selected is chosen in the top bar (or the list
 * beside this panel); this is where it's managed.
 */
export default function SelectedActivityPanel({
  activities,
  selectedActivityId,
  selectedOperatorId,
  onActivitiesChanged,
  editRequested,
  onEditRequestHandled,
  repeaters,
  operators,
  events = [],
}: Props) {
  const [editingFocused, setEditingFocused] = useState(false);
  const [draft, setDraft] = useState<ActivityDraft | null>(null);
  const change = (patch: Partial<ActivityDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const [deletingFocused, setDeletingFocused] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const focusedActivity = activities.find((a) => a.id === selectedActivityId) ?? null;
  function startEditFocused() {
    if (!focusedActivity) return;
    const { date, time } = splitScheduledAt(focusedActivity.scheduled_at);
    setDraft({
      title: focusedActivity.title,
      type: focusedActivity.activity_type,
      operatorId: selectedOperatorId ?? "",
      date,
      time,
      frequency: focusedActivity.frequency,
      repeater: repeaterOf(focusedActivity),
      location: locationOf(focusedActivity),
      // When it actually started and ended, correctable without reopening (LIFE-009).
      started: focusedActivity.opened_at ? formatContactTime(focusedActivity.opened_at) : "",
      ended: focusedActivity.closed_at ? formatContactTime(focusedActivity.closed_at) : "",
      eventId: focusedActivity.event_id,
    });
    setEditError(null);
    setEditingFocused(true);
  }

  useEffect(() => {
    if (!editRequested) return;
    startEditFocused();
    onEditRequestHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequested]);

  function cancelEditFocused() {
    setEditingFocused(false);
  }

  async function saveEditFocused() {
    if (!focusedActivity || !draft) return;
    const {
      title: rawTitle,
      type: editType,
      operatorId: editOperator,
      date: editDate,
      time: editTime,
      frequency: editFrequency,
      repeater: editRepeater,
      location: editLocation,
      started: editStarted,
      ended: editEnded,
    } = draft;
    const title = rawTitle.trim();
    if (!title || (isRangeCheck(editType) && !editRepeater)) return;
    const before = repeaterOf(focusedActivity);
    const changed = JSON.stringify(before) !== JSON.stringify(editRepeater);
    // Started/ended times, when it has them and they were changed.
    const hasTimes = focusedActivity.state !== "scheduled" && focusedActivity.opened_at !== "";
    const closed = focusedActivity.state === "closed";
    const timesChanged =
      hasTimes &&
      (editStarted.trim() !== formatContactTime(focusedActivity.opened_at) ||
        (closed && editEnded.trim() !== formatContactTime(focusedActivity.closed_at)));
    const started = parseContactTime(editStarted);
    const ended = parseContactTime(editEnded);
    if (timesChanged) {
      if (started.kind !== "ok") return setEditError("Enter when it started as YYYY-MM-DD HH:MM.");
      if (closed && ended.kind !== "ok") return setEditError("Enter when it ended as YYYY-MM-DD HH:MM.");
    }
    try {
      if (timesChanged && started.kind === "ok") {
        await api.setActivityTimes(
          focusedActivity.id,
          started.iso,
          closed && ended.kind === "ok" ? ended.iso : null,
          selectedOperatorId
        );
      }
      // Set before the type changes, so a new range check already has one;
      // cleared after, so a range check being changed away may lose it.
      if (changed && editRepeater) {
        await api.setActivityRepeater(
          focusedActivity.id,
          editRepeater.name || null,
          editRepeater.lat,
          editRepeater.lon
        );
      }
      await api.updateActivity(
        focusedActivity.id,
        title,
        editType,
        // A station log is ongoing: it has no date (the earlier one stays in its history).
        isLog(editType) ? null : combineScheduledAt(editDate, editTime) || null,
        editFrequency.trim() || null,
        selectedOperatorId
      );
      if (changed && !editRepeater) {
        await api.setActivityRepeater(focusedActivity.id, null, null, null);
      }
      if (JSON.stringify(locationOf(focusedActivity)) !== JSON.stringify(editLocation)) {
        if (editLocation) {
          await api.setActivityLocationCoords(
            focusedActivity.id,
            editLocation.lat,
            editLocation.lon,
            editLocation.label || null
          );
        } else {
          await api.setActivityLocation(focusedActivity.id, "");
        }
      }
      const eventId = isLog(editType) ? "" : draft.eventId;
      if (eventId !== focusedActivity.event_id) {
        await api.setActivityEvent(focusedActivity.id, eventId || null, selectedOperatorId);
      }
      // Last, so the corrections above move with everything else.
      if (editOperator && editOperator !== selectedOperatorId) {
        await api.changeActivityOperator(focusedActivity.id, editOperator);
      }
    } catch (e) {
      setEditError(String(e));
      onActivitiesChanged();
      return;
    }
    setEditingFocused(false);
    onActivitiesChanged();
  }

  return (
    <div className="panel">
      <h3><SquarePen className="heading-icon" />Selected Activity</h3>
      {!focusedActivity && (
        <p className="checkin-empty-state">
          No activity selected. Pick one in Activities above, or start a new one.
        </p>
      )}
      {focusedActivity && !editingFocused && (
        <>
          <div className="activity-detail">
            <div className="activity-detail-title">{focusedActivity.title}</div>
            <div className="activity-detail-meta">
              {activityTypeLabel(focusedActivity.activity_type)}
              {focusedActivity.scheduled_at ? ` · ${focusedActivity.scheduled_at}` : ""}
              {focusedActivity.frequency ? ` · ${focusedActivity.frequency}` : ""}
              {focusedActivity.repeater_lat != null
                ? ` · Repeater ${focusedActivity.repeater_name || formatCoordsWithGrid(focusedActivity.repeater_lat, focusedActivity.repeater_lon!)}`
                : ""}
              {focusedActivity.location_lat != null && focusedActivity.location_lon != null
                ? ` · ${formatCoordsWithGrid(focusedActivity.location_lat, focusedActivity.location_lon)}`
                : ""}
            </div>
          </div>
          <div className="inline-form">
            <button onClick={startEditFocused}>Edit</button>
            <button className="danger" onClick={() => setDeletingFocused(true)}>
              Delete…
            </button>
          </div>

          <ActivitySummaryPanel
            activity={focusedActivity}
            operator={operators.find((o) => o.id === selectedOperatorId) ?? null}
          />

        </>
      )}
      {focusedActivity && editingFocused && draft && (
        <ActivityForm
          draft={draft}
          onChange={change}
          operators={operators}
          repeaters={repeaters}
          operatorLocation={operatorPlace(operators.find((o) => o.id === draft.operatorId))}
          showStarted={focusedActivity.state !== "scheduled" && focusedActivity.opened_at !== ""}
          showEnded={focusedActivity.state === "closed"}
          operatorNote={
            draft.operatorId !== (selectedOperatorId ?? "")
              ? "Everything already logged in this activity will be moved to the new operator too, and History will note the change."
              : undefined
          }
          submitLabel="Save"
          onSubmit={saveEditFocused}
          onCancel={cancelEditFocused}
          error={editError}
          mapTitle={focusedActivity.title}
          events={events}
        />
      )}

      {deletingFocused && focusedActivity && (
        <DeleteActivityDialog
          activity={focusedActivity}
          operatorId={selectedOperatorId}
          onClose={() => setDeletingFocused(false)}
          onDeleted={() => {
            setDeletingFocused(false);
            // The deleted activity drops out of the list, and focus moves on (AUDIT-011).
            onActivitiesChanged();
          }}
        />
      )}

    </div>
  );
}

/** An activity's repeater, if it has one. */
function repeaterOf(a: Activity): ActivityRepeater | null {
  return a.repeater_lat != null && a.repeater_lon != null
    ? { name: a.repeater_name, lat: a.repeater_lat, lon: a.repeater_lon }
    : null;
}

/** An activity's net control location, if it has its own. */
function locationOf(a: Activity): { label: string; lat: number; lon: number } | null {
  return a.location_lat != null && a.location_lon != null
    ? { label: a.location_label, lat: a.location_lat, lon: a.location_lon }
    : null;
}
