import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, ActivityTemplate } from "../../types";
import SaveTemplateBar from "./SaveTemplateBar";
import ActivitySummaryPanel from "./ActivitySummaryPanel";
import ActivityTypeSelect from "./ActivityTypeSelect";
import { activityTypeLabel } from "../../activityTypes";
import LocationPicker from "../LocationPicker";
import { formatCoordsWithGrid } from "../../geo";
import { combineScheduledAt, splitScheduledAt } from "../../utils";

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
}

/**
 * Edit, archive, and per-activity location controls for the selected
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
  const [activityLocationError, setActivityLocationError] = useState<string | null>(null);
  const [showActivityPicker, setShowActivityPicker] = useState(false);
  const [locationSectionOverride, setLocationSectionOverride] = useState<boolean | null>(null);

  const focusedActivity = activities.find((a) => a.id === selectedActivityId) ?? null;
  // Collapsed by default (it's a rarely-needed override) unless a location is
  // already set for this activity, in which case show it so it isn't hidden.
  const showLocationSection = locationSectionOverride ?? focusedActivity?.location_lat != null;

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
    if (!title) return;
    await api.updateActivity(
      focusedActivity.id,
      title,
      editType,
      combineScheduledAt(editDate, editTime) || null,
      editFrequency.trim() || null,
      selectedOperatorId
    );
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
      <h3>Selected Activity</h3>
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
              <h4>Location for this activity</h4>
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
                  falls back to the operator's own location (below) when unset.
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
          <button onClick={saveEditFocused}>Save</button>
          <button onClick={cancelEditFocused}>Cancel</button>
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

      {showActivityPicker && focusedActivity && (
        <LocationPicker
          title={`Location — ${focusedActivity.title}`}
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
