import { useEffect, useRef, useState } from "react";
import * as api from "../../api";
import type { Activity, Operator, Repeater } from "../../types";
import { formatCoords } from "../../geo";
import LocationPicker from "../LocationPicker";
import ActivityTypeSelect from "./ActivityTypeSelect";
import ActivityRepeaterField, { type ActivityRepeater } from "./ActivityRepeaterField";
import type { ActivityPrefill } from "./activityPrefill";
import { DEFAULT_ACTIVITY_TYPE, isLog, isRangeCheck } from "../../activityTypes";
import { combineScheduledAt, todayIso } from "../../utils";
import { CirclePlus } from "lucide-react";

interface Props {
  activities: Activity[];
  onActivitiesChanged: () => void;
  onSelectActivity: (id: string) => void;
  operators: Operator[];
  selectedOperatorId: string | null;
  /** The repeater directory, to pick from. */
  repeaters: Repeater[];
  /** Values to fill the form with, e.g. from a net listing (NETL-030). */
  prefill?: ActivityPrefill | null;
  onPrefillHandled?: () => void;
}

export default function CreateActivityPanel({
  activities,
  onActivitiesChanged,
  onSelectActivity,
  operators,
  selectedOperatorId,
  repeaters,
  prefill = null,
  onPrefillHandled,
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
  // Where net control runs the activity from, if not the operator's usual
  // location. When left unset the operator's own location is used (see operatorLocation).
  const [location, setLocation] = useState<{
    label: string;
    lat: number;
    lon: number;
  } | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // The repeater it runs on, apart from where net control is (RPT-021). A
  // range check must have one (RANGE-002).
  const [repeater, setRepeater] = useState<ActivityRepeater | null>(null);
  const rangeCheck = isRangeCheck(activityType);
  const missingRepeater = rangeCheck && !repeater;

  // Opens the form (even if collapsed), fills it from a net listing, and
  // brings it into view. Nothing is created until Create (NETL-031).
  useEffect(() => {
    if (!prefill) return;
    setCollapsed(false);
    setActivityTitle(prefill.title);
    setActivityType(prefill.activityType);
    setActivityDate(prefill.date);
    setActivityTime(prefill.time);
    setActivityFrequency(prefill.frequency);
    setRepeater(prefill.repeater);
    onPrefillHandled?.();
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      panelRef.current
        ?.querySelector<HTMLInputElement>('input[placeholder="Activity title"]')
        ?.focus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

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

  // Discards whatever was typed and closes the form
  // (it stays open only when there are no activities yet, where it's the first step).
  function handleCancel() {
    setActivityTitle("");
    setActivityType(DEFAULT_ACTIVITY_TYPE);
    setActivityDate(todayIso());
    setActivityTime("");
    setActivityFrequency("");
    setLocation(null);
    setRepeater(null);
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
      {/* Last, once everything above is filled in. */}
      {expanded && (
        <div className="inline-form create-activity-actions">
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
