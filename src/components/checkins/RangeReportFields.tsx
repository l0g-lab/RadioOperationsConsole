import { useState } from "react";
import { formatCoords } from "../../geo";
import {
  SIGNAL_REPORTS,
  STATION_KINDS,
  type RangeDraft,
  type RangeField,
} from "../../rangeCheck";
import LocationPicker from "../LocationPicker";
import { hintWidth } from "../hintWidth";

const HINTS = {
  crossStreet: "Cross street (e.g. Colonial & Mills)",
  antenna: "Antenna (e.g. Diamond X50 at 30 ft)",
  power: "Power (e.g. 50 W)",
  notes: "Notes (optional)",
};

/**
 * The range-check report inputs (RANGE-010–014), used when taking a check-in
 * and when correcting one. Fields in `invalid` are marked; the caller decides
 * when (after a refused save).
 */
export function RangeReportFields({
  value,
  onChange,
  onEnter,
  invalid = [],
  repeater,
  callSign = "",
}: {
  value: RangeDraft;
  onChange: (d: RangeDraft) => void;
  onEnter: () => void;
  invalid?: RangeField[];
  /** Where the map opens when the station has no point yet. */
  repeater: { lat: number; lon: number } | null;
  /** For the map's title. */
  callSign?: string;
}) {
  const [picking, setPicking] = useState(false);
  const bad = (f: RangeField) => invalid.includes(f);
  const set = (patch: Partial<RangeDraft>) => onChange({ ...value, ...patch });
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onEnter();
  };
  const text = (key: "crossStreet" | "antenna" | "power" | "notes", label: string, field?: RangeField) => (
    <input
      aria-label={label}
      aria-invalid={field ? bad(field) : undefined}
      placeholder={HINTS[key]}
      className={`contact-field range-field-${key}`}
      style={hintWidth(HINTS[key])}
      value={value[key]}
      onChange={(e) => set({ [key]: e.target.value })}
      onKeyDown={enter}
    />
  );
  const report = (key: "weHear" | "theyHear", label: string) => (
    <select
      aria-label={label}
      aria-invalid={bad(key)}
      className="range-field-report"
      value={value[key]}
      onChange={(e) => set({ [key]: e.target.value })}
    >
      <option value="">{label}…</option>
      {SIGNAL_REPORTS.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
  const hasPoint = value.lat != null && value.lon != null;

  return (
    <div className="contact-fields range-fields">
      {text("crossStreet", "Cross street", "crossStreet")}
      <span className="range-field-point">
        <button
          type="button"
          aria-invalid={bad("point")}
          className={bad("point") ? "range-field-missing" : undefined}
          onClick={() => setPicking(true)}
        >
          {hasPoint ? "Move pin" : "Pick on map"}
        </button>
        <span className="range-field-point-text" aria-live="polite">
          {hasPoint ? formatCoords(value.lat!, value.lon!) : "No point yet"}
        </span>
      </span>
      <span
        role="radiogroup"
        aria-label="Station type"
        aria-invalid={bad("stationKind")}
        className={"range-kinds" + (bad("stationKind") ? " range-field-missing" : "")}
      >
        {STATION_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={value.stationKind === k.id}
            className={value.stationKind === k.id ? "range-kind-chosen" : undefined}
            onClick={() => set({ stationKind: k.id })}
          >
            {k.label}
          </button>
        ))}
      </span>
      {/* Only a base station's antenna is asked for (RANGE-012). */}
      {value.stationKind === "base" && text("antenna", "Antenna", "antenna")}
      {text("power", "Power", "power")}
      {report("weHear", "How we hear them")}
      {report("theyHear", "How they hear the repeater")}
      {text("notes", "Notes")}

      {picking && (
        <LocationPicker
          title={`Where is ${callSign.trim().toUpperCase() || "the station"}?`}
          initialLat={value.lat}
          initialLon={value.lon}
          initialLabel=""
          mapOnly
          startAt={repeater}
          hint={
            value.crossStreet.trim()
              ? `Click the exact spot of “${value.crossStreet.trim()}”. Searching only moves the map.`
              : undefined
          }
          onSave={(lat, lon) => {
            set({ lat, lon });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
