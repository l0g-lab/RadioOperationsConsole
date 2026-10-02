import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, ActivityTemplate, Repeater } from "../../types";
import SaveTemplateBar from "./SaveTemplateBar";
import ActivitySummaryPanel from "./ActivitySummaryPanel";
import ActivityTypeSelect from "./ActivityTypeSelect";
import ActivityRepeaterField, { type ActivityRepeater } from "./ActivityRepeaterField";
import { activityTypeLabel, isLog, isRangeCheck } from "../../activityTypes";
import LocationPicker from "../LocationPicker";
import DeleteActivityDialog from "../lifecycle/DeleteActivityDialog";
import { formatCoordsWithGrid } from "../../geo";
import { combineScheduledAt, splitScheduledAt } from "../../utils";
import { SquarePen } from "lucide-react";

interface Props {
  activities: Activity[];
  selectedActivityId: string | null;
  selectedOperatorId: string | null;
  onActivitiesChanged: () => void;
  /** True when the top bar's Edit link was clicked: open the edit form straight away. */
  editRequested: boolean;
  onEditRequestHandled: () => void;
  templates: ActivityTemplate[];
  onTemplatesChanged: () => void;
  /** The repeater directory, to pick from. */
  repeaters: Repeater[];
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
  templates,
  onTemplatesChanged,
  repeaters,
}: Props) {
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSavedName, setTemplateSavedName] = useState<string | null>(null);
  const [editingFocused, setEditingFocused] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editFrequency, setEditFrequency] = useState("");
  const [archivingFocused, setArchivingFocused] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [deletingFocused, setDeletingFocused] = useState(false);
  const [activityLocationError, setActivityLocationError] = useState<string | null>(null);
  const [showActivityPicker, setShowActivityPicker] = useState(false);
  const [locationSectionOverride, setLocationSectionOverride] = useState<boolean | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editRepeater, setEditRepeater] = useState<ActivityRepeater | null>(null);

  const focusedActivity = activities.find((a) => a.id === selectedActivityId) ?? null;
  // Collapsed by default (it's a rarely-needed override) unless a location is
  // already set for this activity, in which case show it so it isn't hidden.
  const showLocationSection = locationSectionOverride ?? focusedActivity?.location_lat != null;
  // A range check must have a repeater (RANGE-002).
  const editNeedsRepeater = isRangeCheck(editType) && !editRepeater;

  useEffect(() => {
    setSavingTemplate(false);
    setTemplateSavedName(null);
  }, [selectedActivityId]);

  async function saveAsTemplate(name: string) {
    if (!focusedActivity) return;
    const { time } = splitScheduledAt(focusedActivity.scheduled_at);
    await api.saveActivityTemplate(
      name,
      focusedActivity.title,
      focusedActivity.activity_type,
      time || null,
      focusedActivity.frequency || null,
      focusedActivity.location_label || null,
      focusedActivity.location_lat,
      focusedActivity.location_lon
    );
    onTemplatesChanged();
    setSavingTemplate(false);
    setTemplateSavedName(name);
  }

  function startEditFocused() {
    if (!focusedActivity) return;
    const { date, time } = splitScheduledAt(focusedActivity.scheduled_at);
    setEditTitle(focusedActivity.title);
    setEditType(focusedActivity.activity_type);
    setEditDate(date);
    setEditTime(time);
    setEditFrequency(focusedActivity.frequency);
    setEditError(null);
    setEditRepeater(repeaterOf(focusedActivity));
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
    try {
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

  async function handleClearActivityLocation() {
    if (!focusedActivity) return;
    setActivityLocationError(null);
    try {
      await api.setActivityLocation(focusedActivity.id, "");
      onActivitiesChanged();
    } catch (e) {
      setActivityLocationError(String(e));
    }
  }

  async function handleSaveActivityPin(lat: number, lon: number, label: string) {
    if (!focusedActivity) return;
    setActivityLocationError(null);
    try {
      await api.setActivityLocationCoords(focusedActivity.id, lat, lon, label || null);
      onActivitiesChanged();
      setShowActivityPicker(false);
    } catch (e) {
      setActivityLocationError(String(e));
    }
  }

  return (
    <div className="panel">
      <h3><SquarePen className="heading-icon" />Selected Activity</h3>
      {!focusedActivity && (
        <p className="checkin-empty-state">
          No activity selected. Pick one in the top bar or the list on the left, or create one
          below.
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
            <button
              onClick={() => {
                setSavingTemplate(true);
                setTemplateSavedName(null);
              }}
              title="Keep this activity's title, time, frequency and location to start future ones from"
            >
              Save as template
            </button>
            <button className="danger" onClick={() => setDeletingFocused(true)}>
              Delete…
            </button>
            {templateSavedName && (
              <span className="qrz-status qrz-status-found">
                Saved template “{templateSavedName}”
              </span>
            )}
          </div>
          {savingTemplate && (
            <SaveTemplateBar
              defaultName={focusedActivity.title}
              existingNames={templates.map((t) => t.name)}
              onSave={saveAsTemplate}
              onCancel={() => setSavingTemplate(false)}
            />
          )}

          <ActivitySummaryPanel activity={focusedActivity} />

          <div className="location-subpanel">
            <div className="panel-header-row">
              <h4>Net control location</h4>
              <button
                className="link-button"
                onClick={() => setLocationSectionOverride(!showLocationSection)}
              >
                {showLocationSection ? "Hide" : "Set a different location"}
              </button>
            </div>
            {showLocationSection && (
              <>
                <p className="settings-hint">
                  Where the operator is running this activity from — e.g. a field site or county
                  EOC, if different from their usual location. Used on the check-in location map;
                  falls back to the operator's own location (below) when unset. The repeater is set
                  separately, with Edit.
                </p>
                {activityLocationError && (
                  <p className="weather-area-error">{activityLocationError}</p>
                )}
                {focusedActivity.location_lat != null && focusedActivity.location_lon != null ? (
                  <p className="weather-area-status">
                    Set to: <strong>{focusedActivity.location_label}</strong> —{" "}
                    {formatCoordsWithGrid(
                      focusedActivity.location_lat,
                      focusedActivity.location_lon
                    )}
                  </p>
                ) : (
                  <p className="weather-area-status">
                    Not set — the operator's own location is used instead.
                  </p>
                )}
                <div className="inline-form">
                  <button onClick={() => setShowActivityPicker(true)}>Edit location</button>
                </div>
              </>
            )}
          </div>
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
          <button
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
          initialLat={focusedActivity.location_lat}
          initialLon={focusedActivity.location_lon}
          initialLabel={focusedActivity.location_label}
          onSave={handleSaveActivityPin}
          onClear={focusedActivity.location_lat != null ? handleClearActivityLocation : undefined}
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
