import { ACTIVITY_TYPES, activityTypeDef } from "../../activityTypes";

/** Picks an activity's type. A stored type this version doesn't know still shows, as itself. */
export default function ActivityTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const known = ACTIVITY_TYPES.some((t) => t.id === value);
  return (
    <label className="activity-field">
      <span className="activity-field-label">Type</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={activityTypeDef(value).description}
      >
        {!known && <option value={value}>{activityTypeDef(value).label}</option>}
        {ACTIVITY_TYPES.map((t) => (
          <option key={t.id} value={t.id} title={t.description}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
