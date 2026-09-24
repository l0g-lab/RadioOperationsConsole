import { useState } from "react";
import * as api from "../../api";
import type { ActivityTemplate } from "../../types";
import { formatCoords } from "../../geo";
import LocationPicker from "../LocationPicker";
import ActivityTypeSelect from "./ActivityTypeSelect";
import { DEFAULT_ACTIVITY_TYPE, activityTypeLabel } from "../../activityTypes";

interface Props {
  templates: ActivityTemplate[];
  onTemplatesChanged: () => void;
  /** Starts the new-activity form from this template. */
  onCreateFrom: (templateId: string) => void;
}

/** The saved activity templates, with removal. Templates are made from the Selected Activity panel or the create form. */
export default function TemplatesPanel({ templates, onTemplatesChanged, onCreateFrom }: Props) {
  const [show, setShow] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The template being edited, held as form text until saved.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [activityType, setActivityType] = useState(DEFAULT_ACTIVITY_TYPE);
  const [time, setTime] = useState("");
  const [frequency, setFrequency] = useState("");
  const [location, setLocation] = useState<{ label: string; lat: number; lon: number } | null>(
    null
  );
  const [showPicker, setShowPicker] = useState(false);

  function startEdit(t: ActivityTemplate) {
    setEditingId(t.id);
    setDeletingId(null);
    setError(null);
    setName(t.name);
    setTitle(t.title);
    setActivityType(t.activity_type);
    setTime(t.scheduled_time);
    setFrequency(t.frequency);
    setLocation(
      t.location_lat != null && t.location_lon != null
        ? { label: t.location_label, lat: t.location_lat, lon: t.location_lon }
        : null
    );
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!name.trim() || !title.trim()) {
      setError("A template needs a name and a title.");
      return;
    }
    setError(null);
    try {
      await api.updateActivityTemplate(
        editingId,
        name,
        title,
        activityType,
        time || null,
        frequency || null,
        location?.label || null,
        location?.lat ?? null,
        location?.lon ?? null
      );
      setEditingId(null);
      onTemplatesChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  function onEditKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") setEditingId(null);
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.deleteActivityTemplate(id);
      setDeletingId(null);
      onTemplatesChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h3>Activity Templates{templates.length > 0 ? ` (${templates.length})` : ""}</h3>
        <button className="link-button" onClick={() => setShow((v) => !v)}>
          {show ? "Hide templates" : "Show templates"}
        </button>
      </div>
      {show && (
        <>
          {templates.length === 0 && (
            <p className="checkin-empty-state">
              No templates yet. Use "Save as template" on the selected activity, or on the
              new-activity form, to keep its title, time, frequency and location for next time.
            </p>
          )}
          {error && <p className="weather-area-error">{error}</p>}
          {templates.map((t) =>
            editingId === t.id ? (
              <div key={t.id} className="template-edit" onKeyDown={onEditKey}>
                <div className="inline-form">
                  <label>
                    Name:
                    <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                  <label>
                    Activity title:
                    <input
                      className="activity-title-input"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <ActivityTypeSelect value={activityType} onChange={setActivityType} />
                  <label>
                    Time (HH:MM):
                    <input
                      placeholder="e.g. 19:00"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                    />
                  </label>
                  <label>
                    Frequency:
                    <input
                      placeholder="e.g. 146.940 -0.6 PL 100.0"
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                    />
                  </label>
                </div>
                <div className="inline-form">
                  <span className="settings-hint">
                    Location:{" "}
                    {location
                      ? `${location.label ? `${location.label} — ` : ""}${formatCoords(location.lat, location.lon)}`
                      : "none"}
                  </span>
                  <button onClick={() => setShowPicker(true)}>
                    {location ? "Change location" : "Set location"}
                  </button>
                  {location && (
                    <button className="link-button" onClick={() => setLocation(null)}>
                      Clear location
                    </button>
                  )}
                </div>
                <div className="inline-form">
                  <button onClick={saveEdit}>Save changes</button>
                  <button onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div key={t.id} className="offline-pack-row">
                <div className="offline-pack-info">
                  <strong>{t.name}</strong>
                  <span className="settings-hint">
                    {" "}
                    {[
                      // The name is usually the net's own name, so the title is
                      // only worth repeating when it's actually different.
                      t.title.trim().toLowerCase() === t.name.trim().toLowerCase()
                        ? ""
                        : t.title,
                      activityTypeLabel(t.activity_type),
                      t.scheduled_time,
                      t.frequency,
                      t.location_label,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {deletingId === t.id ? (
                  <div className="inline-form">
                    <button onClick={() => handleDelete(t.id)}>Confirm delete</button>
                    <button onClick={() => setDeletingId(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="inline-form">
                    <button
                      onClick={() => onCreateFrom(t.id)}
                      title="Fill in the Create New Activity form from this template"
                    >
                      Use template
                    </button>
                    <button onClick={() => startEdit(t)}>Edit</button>
                    <button onClick={() => setDeletingId(t.id)}>Delete</button>
                  </div>
                )}
              </div>
            )
          )}
          {showPicker && (
            <LocationPicker
              title={`Location — ${name || "template"}`}
              initialLat={location?.lat ?? null}
              initialLon={location?.lon ?? null}
              initialLabel={location?.label ?? ""}
              onSave={(lat, lon, label) => {
                setLocation({ lat, lon, label });
                setShowPicker(false);
              }}
              onClear={
                location
                  ? () => {
                      setLocation(null);
                      setShowPicker(false);
                    }
                  : undefined
              }
              onClose={() => setShowPicker(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
