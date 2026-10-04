import { useState } from "react";
import type { Repeater } from "../../types";
import { formatCoords } from "../../geo";
import { formatRepeater } from "../../repeaters";
import LocationPicker from "../LocationPicker";

/** An activity's repeater: a name and where it is (RPT-021). */
export interface ActivityRepeater {
  name: string;
  lat: number;
  lon: number;
}

/**
 * Chooses the repeater an activity runs on: picked from the directory (which
 * also fills in the frequency) or placed by hand for one that isn't listed
 * (RPT-020–023). Apart from the activity's own location, which is net
 * control's.
 */
export default function ActivityRepeaterField({
  repeaters,
  value,
  onChange,
  onFrequency,
  required = false,
  title,
}: {
  repeaters: Repeater[];
  value: ActivityRepeater | null;
  onChange: (r: ActivityRepeater | null) => void;
  /** Called with the repeater's one-line form when one is picked from the directory. */
  onFrequency: (text: string) => void;
  /** A range check: it must have one, so it can be moved but not cleared. */
  required?: boolean;
  /** For the map. */
  title: string;
}) {
  const [placing, setPlacing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function pick(id: string) {
    const r = repeaters.find((x) => x.id === id);
    if (!r) return;
    onFrequency(formatRepeater(r));
    if (r.location_lat != null && r.location_lon != null) {
      onChange({ name: r.name, lat: r.location_lat, lon: r.location_lon });
      setNote(null);
    } else {
      setNote(
        `${r.name} has no location in the directory, so only its frequency was filled in. Place it on the map, or add its location under Repeaters.`
      );
    }
  }

  const missing = required && !value;
  return (
    <div className="inline-form activity-repeater">
      <span className={missing ? "weather-area-error" : value ? undefined : "settings-hint"}>
        {value ? (
          <strong>
            {value.name ? `${value.name} — ` : ""}
            {formatCoords(value.lat, value.lon)}
          </strong>
        ) : missing ? (
          "Not set — a range check needs its repeater"
        ) : (
          "None"
        )}
      </span>
      {repeaters.length > 0 && (
        <select aria-label="Pick a repeater" value="" onChange={(e) => pick(e.target.value)}>
          <option value="">Pick from directory…</option>
          {repeaters.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} — {formatRepeater(r)}
            </option>
          ))}
        </select>
      )}
      <button type="button" onClick={() => setPlacing(true)}>
        {value ? "Move repeater" : "Place repeater on map"}
      </button>
      {value && !required && (
        <button type="button" className="link-button" onClick={() => onChange(null)}>
          No repeater
        </button>
      )}
      {note && <p className="settings-hint activity-repeater-note">{note}</p>}
      {placing && (
        <LocationPicker
          title={title}
          initialLat={value?.lat ?? null}
          initialLon={value?.lon ?? null}
          initialLabel={value?.name ?? ""}
          onSave={(lat, lon, label) => {
            onChange({ name: label, lat, lon });
            setPlacing(false);
            setNote(null);
          }}
          onClose={() => setPlacing(false)}
        />
      )}
    </div>
  );
}
