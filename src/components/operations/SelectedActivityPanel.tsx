import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, Operator, Repeater } from "../../types";
import ActivitySummaryPanel from "./ActivitySummaryPanel";
import ActivityTypeSelect from "./ActivityTypeSelect";
import ActivityRepeaterField, { type ActivityRepeater } from "./ActivityRepeaterField";
import { activityTypeLabel, isLog, isRangeCheck } from "../../activityTypes";
import LocationPicker from "../LocationPicker";
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
  /** Opens the new-activity form. */
  onNewActivity: () => void;
  /** To choose who runs the activity. */
  operators: Operator[];
}

/**
 * Edit, archive, delete, and per-activity location controls for the selected
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
  onNewActivity,
  operators,
}: Props) {
  const [editingFocused, setEditingFocused] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editFrequency, setEditFrequency] = useState("");
  // When it actually started and ended, correctable without reopening (LIFE-009).
  const [editStarted, setEditStarted] = useState("");
  const [editEnded, setEditEnded] = useState("");
  const [archivingFocused, setArchivingFocused] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [deletingFocused, setDeletingFocused] = useState(false);
  const [showActivityPicker, setShowActivityPicker] = useState(false);
  // Where net control runs it from, changed with Edit like the rest; null
  // means the operator's own location is used.
  // Who runs it; changing it moves everything recorded in it too.
  const [editOperator, setEditOperator] = useState("");
  const [editLocation, setEditLocation] = useState<{ label: string; lat: number; lon: number } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editRepeater, setEditRepeater] = useState<ActivityRepeater | null>(null);

  const focusedActivity = activities.find((a) => a.id === selectedActivityId) ?? null;
  // Collapsed by default (it's a rarely-needed override) unless a location is
  // already set for this activity, in which case show it so it isn't hidden.
  // A range check must have a repeater (RANGE-002).
  const editNeedsRepeater = isRangeCheck(editType) && !editRepeater;

  function startEditFocused() {
    if (!focusedActivity) return;
    const { date, time } = splitScheduledAt(focusedActivity.scheduled_at);
    setEditTitle(focusedActivity.title);
    setEditType(focusedActivity.activity_type);
    setEditDate(date);
    setEditTime(time);
    setEditFrequency(focusedActivity.frequency);
    setEditStarted(focusedActivity.opened_at ? formatContactTime(focusedActivity.opened_at) : "");
    setEditEnded(focusedActivity.closed_at ? formatContactTime(focusedActivity.closed_at) : "");
    setEditError(null);
    setEditRepeater(repeaterOf(focusedActivity));
    setEditLocation(locationOf(focusedActivity));
    setEditOperator(selectedOperatorId ?? "");
    setEditingFocused(true);
    setArchivingFocused(false);
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
    if (!focusedActivity) return;
    const title = editTitle.trim();
    if (!title || editNeedsRepeater) return;
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

  function startArchiveFocused() {
    setArchivingFocused(true);
    setArchiveReason("");
    setEditingFocused(false);
  }

  function cancelArchiveFocused() {
    setArchivingFocused(false);
  }

  async function confirmArchiveFocused() {
    if (!focusedActivity) return;
    await api.archiveActivity(focusedActivity.id, archiveReason.trim() || null, selectedOperatorId);
    setArchivingFocused(false);
    onActivitiesChanged();
  }

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h3><SquarePen className="heading-icon" />Selected Activity</h3>
        <button className="primary" onClick={onNewActivity}>
          + New activity
        </button>
      </div>
      {!focusedActivity && (
        <p className="checkin-empty-state">
          No activity selected. Pick one in the top bar or the list on the left, or start a new
          one.
        </p>
      )}
      {focusedActivity && !editingFocused && !archivingFocused && (
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
            <button onClick={startArchiveFocused}>Archive</button>
            <button className="danger" onClick={() => setDeletingFocused(true)}>
              Delete…
            </button>
          </div>

          <ActivitySummaryPanel activity={focusedActivity} />

        </>
      )}
      {focusedActivity && editingFocused && (
        <div className="inline-form">
          <input
            autoFocus
            className="activity-title-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEditFocused();
              if (e.key === "Escape") cancelEditFocused();
            }}
          />
          <ActivityTypeSelect value={editType} onChange={setEditType} />
          {operators.length > 1 && (
            <label title="Net control: everything logged in this activity goes under this operator">
              Operator:
              <select value={editOperator} onChange={(e) => setEditOperator(e.target.value)}>
                {!operators.some((o) => o.id === editOperator) && <option value={editOperator}>(other)</option>}
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.display_name}
                    {o.call_sign ? ` (${o.call_sign})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!isLog(editType) && (
            <>
              <label>
                Date (YYYY-MM-DD):
                <input
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEditFocused();
                    if (e.key === "Escape") cancelEditFocused();
                  }}
                />
              </label>
              <label>
                Time (HH:MM, optional):
                <input
                  placeholder="e.g. 19:00"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEditFocused();
                    if (e.key === "Escape") cancelEditFocused();
                  }}
                />
              </label>
            </>
          )}
          {focusedActivity.state !== "scheduled" && focusedActivity.opened_at && (
            <>
              <label>
                Started:
                <input
                  value={editStarted}
                  title="When it actually started: YYYY-MM-DD HH:MM"
                  onChange={(e) => setEditStarted(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEditFocused();
                    if (e.key === "Escape") cancelEditFocused();
                  }}
                />
              </label>
              {focusedActivity.state === "closed" && (
                <label>
                  Ended:
                  <input
                    value={editEnded}
                    title="When it actually ended: YYYY-MM-DD HH:MM"
                    onChange={(e) => setEditEnded(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEditFocused();
                      if (e.key === "Escape") cancelEditFocused();
                    }}
                  />
                </label>
              )}
            </>
          )}
          <label>
            Frequency:
            <input
              placeholder="e.g. 146.940 -0.6 PL 100.0"
              value={editFrequency}
              onChange={(e) => setEditFrequency(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEditFocused();
                if (e.key === "Escape") cancelEditFocused();
              }}
            />
          </label>
        </div>
      )}
      {focusedActivity && editingFocused && (
        <ActivityRepeaterField
          repeaters={repeaters}
          value={editRepeater}
          onChange={setEditRepeater}
          onFrequency={setEditFrequency}
          required={isRangeCheck(editType)}
          title={`Repeater — ${focusedActivity.title}`}
        />
      )}
      {focusedActivity && editingFocused && (
        <div className="inline-form">
          <span className="settings-hint">
            Net control location:{" "}
            {editLocation ? (
              <strong>
                {editLocation.label ? `${editLocation.label} — ` : ""}
                {formatCoordsWithGrid(editLocation.lat, editLocation.lon)}
              </strong>
            ) : (
              "the operator's own location (unless you choose another)"
            )}
          </span>
          <button onClick={() => setShowActivityPicker(true)}>
            {editLocation ? "Change location" : "Set location"}
          </button>
          {editLocation && (
            <button className="link-button" onClick={() => setEditLocation(null)}>
              Use the operator's location
            </button>
          )}
        </div>
      )}
      {focusedActivity && editingFocused && editOperator !== (selectedOperatorId ?? "") && (
        <p className="settings-hint">
          Everything already logged in this activity will be moved to the new operator too, and
          History will note the change.
        </p>
      )}
      {/* Last, below the whole form, as when creating an activity. */}
      {focusedActivity && editingFocused && (
        <div className="inline-form create-activity-actions">
          <button
            className="primary"
            onClick={saveEditFocused}
            disabled={editNeedsRepeater}
            title={editNeedsRepeater ? "Set the repeater first" : undefined}
          >
            Save
          </button>
          <button onClick={cancelEditFocused}>Cancel</button>
          {editError && <span className="weather-area-error">{editError}</span>}
        </div>
      )}
      {focusedActivity && archivingFocused && (
        <div className="inline-form confirm-row">
          <span>Archive “{focusedActivity.title}”?</span>
          <input
            placeholder="Reason (optional)"
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
          />
          <button onClick={confirmArchiveFocused}>Confirm archive</button>
          <button onClick={cancelArchiveFocused}>Cancel</button>
        </div>
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

      {showActivityPicker && focusedActivity && (
        <LocationPicker
          title={`Net control location — ${focusedActivity.title}`}
          initialLat={editLocation?.lat ?? null}
          initialLon={editLocation?.lon ?? null}
          initialLabel={editLocation?.label ?? ""}
          onSave={(lat, lon, label) => {
            setEditLocation({ lat, lon, label });
            setShowActivityPicker(false);
          }}
          onClear={
            editLocation
              ? () => {
                  setEditLocation(null);
                  setShowActivityPicker(false);
                }
              : undefined
          }
          onClose={() => setShowActivityPicker(false)}
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
