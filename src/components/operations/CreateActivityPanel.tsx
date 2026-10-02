import { useEffect, useRef, useState } from "react";
import * as api from "../../api";
import type { Activity, ActivityTemplate, Operator, Repeater } from "../../types";
import { formatCoords } from "../../geo";
import LocationPicker from "../LocationPicker";
import SaveTemplateBar from "./SaveTemplateBar";
import ActivityTypeSelect from "./ActivityTypeSelect";
import ActivityRepeaterField, { type ActivityRepeater } from "./ActivityRepeaterField";
import { DEFAULT_ACTIVITY_TYPE, isLog, isRangeCheck } from "../../activityTypes";
import { combineScheduledAt, todayIso } from "../../utils";
import { CirclePlus } from "lucide-react";

interface Props {
  activities: Activity[];
  onActivitiesChanged: () => void;
  onSelectActivity: (id: string) => void;
  operators: Operator[];
  selectedOperatorId: string | null;
  templates: ActivityTemplate[];
  onTemplatesChanged: () => void;
  /** Set (to a template id) by the Templates panel's "Use template" button. */
  useTemplateRequest: string | null;
  onUseTemplateHandled: () => void;
  /** The repeater directory, to pick from. */
  repeaters: Repeater[];
}

export default function CreateActivityPanel({
  activities,
  onActivitiesChanged,
  onSelectActivity,
  operators,
  selectedOperatorId,
  templates,
  onTemplatesChanged,
  useTemplateRequest,
  onUseTemplateHandled,
  repeaters,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const hasActivities = activities.length > 0;
  // Collapsed by default once activities exist, so returning users aren't
  // shown a form they rarely need — but always open for a brand-new setup
  // where it's the obvious next step.
  const [collapsed, setCollapsed] = useState(true);
  const expanded = hasActivities ? !collapsed : true;
  const [activityTitle, setActivityTitle] = useState("");
  const [activityType, setActivityType] = useState(DEFAULT_ACTIVITY_TYPE);
  const [activityDate, setActivityDate] = useState(todayIso());
  const [activityTime, setActivityTime] = useState("");
  const [activityFrequency, setActivityFrequency] = useState("");
  // Where the activity runs from, chosen here or carried over from a template.
  // When left unset the operator's own location is used (see operatorLocation).
  const [location, setLocation] = useState<{
    label: string;
    lat: number;
    lon: number;
  } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);

  // The repeater it runs on, apart from where net control is (RPT-021). A
  // range check must have one (RANGE-002).
  const [repeater, setRepeater] = useState<ActivityRepeater | null>(null);
  const rangeCheck = isRangeCheck(activityType);
  const missingRepeater = rangeCheck && !repeater;

  // The acting operator's own location: what the activity defaults to when
  // no location is chosen.
  const operator = operators.find((o) => o.id === selectedOperatorId) ?? null;
  const operatorLocation =
    operator?.location_lat != null && operator.location_lon != null
      ? {
          label: operator.location_label || operator.display_name,
          lat: operator.location_lat,
          lon: operator.location_lon,
        }
      : null;

  function handleUseTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    // Fills the form; the date stays as it is (today), since it's a new occurrence.
    setActivityTitle(t.title);
    setActivityType(t.activity_type);
    setActivityTime(t.scheduled_time);
    setActivityFrequency(t.frequency);
    setLocation(
      t.location_lat != null && t.location_lon != null
        ? { label: t.location_label, lat: t.location_lat, lon: t.location_lon }
        : null
    );
    setTemplateMessage(null);
  }

  // Opens the form (even if collapsed), fills it from the requested template,
  // and brings it into view so the next step is obvious.
  useEffect(() => {
    if (!useTemplateRequest) return;
    setCollapsed(false);
    handleUseTemplate(useTemplateRequest);
    onUseTemplateHandled();
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      panelRef.current
        ?.querySelector<HTMLInputElement>('input[placeholder="Activity title"]')
        ?.focus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useTemplateRequest]);

  // Saves only title, time and frequency. If this replaces an existing template,
  // that template keeps whatever location it already had.
  async function handleSaveTemplate(name: string) {
    const existing = templates.find((t) => t.name.toLowerCase() === name.toLowerCase());
    await api.saveActivityTemplate(
      name,
      activityTitle.trim(),
      activityType,
      activityTime.trim() || null,
      activityFrequency.trim() || null,
      existing?.location_label || null,
      existing?.location_lat ?? null,
      existing?.location_lon ?? null
    );
    onTemplatesChanged();
    setSavingTemplate(false);
    setTemplateMessage(`Saved template “${name}”`);
  }

  // Discards whatever was typed or filled from a template and closes the form
  // (it stays open only when there are no activities yet, where it's the first step).
  function handleCancel() {
    setActivityTitle("");
    setActivityType(DEFAULT_ACTIVITY_TYPE);
    setActivityDate(todayIso());
    setActivityTime("");
    setActivityFrequency("");
    setLocation(null);
    setRepeater(null);
    setSavingTemplate(false);
    setTemplateMessage(null);
    setCollapsed(true);
  }

  async function handleAddActivity() {
    if (!activityTitle.trim() || missingRepeater) return;
    const id = await api.createActivity(
      activityTitle.trim(),
      activityType,
      // A station log is ongoing: it has no date.
      isLog(activityType) ? null : combineScheduledAt(activityDate, activityTime) || null,
      activityFrequency.trim() || null
    );
    const where = location ?? operatorLocation;
    if (where) {
      // The activity exists either way; a failed location just leaves it unset.
      await api
        .setActivityLocationCoords(id, where.lat, where.lon, where.label || null)
        .catch(() => {});
    }
    if (repeater) {
      // Likewise; a range check without one is refused check-ins until it's set.
      await api.setActivityRepeater(id, repeater.name || null, repeater.lat, repeater.lon).catch(() => {});
    }
    onActivitiesChanged();
    onSelectActivity(id);
    setActivityTitle("");
    setActivityType(DEFAULT_ACTIVITY_TYPE);
    setActivityTime("");
    setActivityFrequency("");
    setLocation(null);
    setRepeater(null);
    setSavingTemplate(false);
    setTemplateMessage(null);
    setCollapsed(true);
  }

  return (
    <div className="panel" ref={panelRef}>
      <div className="panel-header-row">
        <h3><CirclePlus className="heading-icon" />Create New Activity</h3>
        {hasActivities && (
          <button className="link-button" onClick={() => setCollapsed((c) => !c)}>
            {expanded ? "Hide" : "+ New activity"}
          </button>
        )}
      </div>
      {expanded && (
        <div className="inline-form">
          {templates.length > 0 && (
            <label>
              Start from a template:
              <select value="" onChange={(e) => handleUseTemplate(e.target.value)}>
                <option value="">— choose a template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <input
            autoFocus={hasActivities}
            className="activity-title-input"
            placeholder="Activity title"
            value={activityTitle}
            onChange={(e) => setActivityTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddActivity();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <ActivityTypeSelect value={activityType} onChange={setActivityType} />
          {/* A station log is ongoing, so it has no date or time. */}
          {!isLog(activityType) && (
            <>
              <label>
                Date (YYYY-MM-DD):
                <input value={activityDate} onChange={(e) => setActivityDate(e.target.value)} />
              </label>
              <label>
                Time (HH:MM, optional):
                <input
                  placeholder="e.g. 19:00"
                  value={activityTime}
                  onChange={(e) => setActivityTime(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddActivity();
                  }}
                />
              </label>
            </>
          )}
          <label>
            Frequency:
            <input
              placeholder="e.g. 146.940 -0.6 PL 100.0"
              value={activityFrequency}
              onChange={(e) => setActivityFrequency(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddActivity();
              }}
            />
          </label>
          <button
            onClick={handleAddActivity}
            disabled={missingRepeater}
            title={missingRepeater ? "Set the repeater first" : undefined}
          >
            Create activity
          </button>
          <button onClick={handleCancel}>Cancel</button>
        </div>
      )}
      {expanded && (
        <ActivityRepeaterField
          repeaters={repeaters}
          value={repeater}
          onChange={setRepeater}
          onFrequency={setActivityFrequency}
          required={rangeCheck}
          title="Repeater — new activity"
        />
      )}
      {expanded && (
        <div className="inline-form">
          <span className="settings-hint">
            Net control location:{" "}
            {location ? (
              <strong>
                {location.label ? `${location.label} — ` : ""}
                {formatCoords(location.lat, location.lon)}
              </strong>
            ) : operatorLocation ? (
              <>
                {operatorLocation.label} (the operator's location — used unless you choose another)
              </>
            ) : (
              "none — the operator has no location set either"
            )}
          </span>
          <button onClick={() => setShowPicker(true)}>
            {location ? "Change location" : "Set location"}
          </button>
          {location && (
            <button className="link-button" onClick={() => setLocation(null)}>
              Use the operator's location
            </button>
          )}
        </div>
      )}
      {expanded && (
        <div className="inline-form">
          {savingTemplate ? (
            <SaveTemplateBar
              defaultName={activityTitle.trim()}
              existingNames={templates.map((t) => t.name)}
              onSave={handleSaveTemplate}
              onCancel={() => setSavingTemplate(false)}
            />
          ) : (
            <button
              className="link-button"
              disabled={!activityTitle.trim()}
              onClick={() => {
                setSavingTemplate(true);
                setTemplateMessage(null);
              }}
              title="Keep the title, type, time and frequency above to start future activities from"
            >
              Save these as a template
            </button>
          )}
          {templateMessage && (
            <span className="qrz-status qrz-status-found">{templateMessage}</span>
          )}
        </div>
      )}
      {showPicker && (
        <LocationPicker
          title="Net control location — new activity"
          initialLat={location?.lat ?? operatorLocation?.lat ?? null}
          initialLon={location?.lon ?? operatorLocation?.lon ?? null}
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
    </div>
  );
}
