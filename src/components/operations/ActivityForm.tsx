import { useState, type ReactNode } from "react";
import type { Operator, Repeater } from "../../types";
import { formatCoordsWithGrid } from "../../geo";
import LocationPicker from "../LocationPicker";
import ActivityTypeSelect from "./ActivityTypeSelect";
import ActivityRepeaterField, { type ActivityRepeater } from "./ActivityRepeaterField";
import { isLog, isRangeCheck, isRelay } from "../../activityTypes";

export interface ActivityPlace {
  label: string;
  lat: number;
  lon: number;
}

/** Everything the activity form edits. */
export interface ActivityDraft {
  title: string;
  type: string;
  operatorId: string;
  date: string;
  time: string;
  frequency: string;
  repeater: ActivityRepeater | null;
  /** Net control's own location; null means the operator's is used. */
  location: ActivityPlace | null;
  /** When it actually started and ended (editing a started activity only). */
  started: string;
  ended: string;
}

/** A labelled field: the label above, the control below. */
function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={"activity-field" + (wide ? " activity-field-wide" : "")}>
      <span className="activity-field-label">{label}</span>
      {children}
    </label>
  );
}

/** A titled group of fields: the title on the left, the fields in a grid. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="activity-form-section">
      <span className="activity-form-section-title">{title}</span>
      <div className="activity-form-fields">{children}</div>
    </div>
  );
}

/**
 * The one form for creating and editing an activity, so both look and work
 * the same: the net (title, type, operator), when, the radio side (frequency,
 * repeater), and net control's location; editing a started activity adds its
 * actual start and end. Enter in a text box saves; Escape cancels.
 */
export default function ActivityForm({
  draft,
  onChange,
  operators,
  repeaters,
  operatorLocation,
  showStarted = false,
  showEnded = false,
  operatorNote,
  submitLabel,
  onSubmit,
  onCancel,
  error,
  mapTitle,
}: {
  draft: ActivityDraft;
  onChange: (patch: Partial<ActivityDraft>) => void;
  operators: Operator[];
  repeaters: Repeater[];
  /** The chosen operator's own location, used when net control has none. */
  operatorLocation: ActivityPlace | null;
  showStarted?: boolean;
  showEnded?: boolean;
  /** Shown under the Net section, e.g. what changing the operator does. */
  operatorNote?: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  onCancel?: () => void;
  error?: string | null;
  /** Names what the maps are for, e.g. "new activity". */
  mapTitle: string;
}) {
  const [placing, setPlacing] = useState(false);
  const rangeCheck = isRangeCheck(draft.type);
  const missingRepeater = rangeCheck && !draft.repeater;
  // What each type needs: a range check is about its repeater, so that's
  // asked up front; a relay passes traffic across frequencies and other means,
  // so it has none; a station log never uses net control's location.
  const repeaterField = (
    <div className="activity-field activity-field-row">
      <span className="activity-field-label">Repeater{rangeCheck ? " (required)" : ""}</span>
      <ActivityRepeaterField
        repeaters={repeaters}
        value={draft.repeater}
        onChange={(repeater) => onChange({ repeater })}
        onFrequency={(frequency) => onChange({ frequency })}
        required={rangeCheck}
        title={`Repeater — ${mapTitle}`}
      />
    </div>
  );
  const text = (key: keyof ActivityDraft, placeholder?: string, autoFocus?: boolean) => (
    <input
      value={draft[key] as string}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange({ [key]: e.target.value })}
    />
  );

  return (
    <div
      className="activity-form"
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || (e.target as HTMLElement).tagName !== "INPUT") return;
        if (e.key === "Enter" && !missingRepeater) onSubmit();
        if (e.key === "Escape") onCancel?.();
      }}
    >
      <Section title="Net">
        <Field label="Title" wide>
          <input
            className="activity-title-input"
            placeholder="Activity title"
            value={draft.title}
            autoFocus
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </Field>
        <ActivityTypeSelect value={draft.type} onChange={(type) => onChange({ type })} />
        {operators.length > 1 && (
          <Field label="Operator">
            <select value={draft.operatorId} onChange={(e) => onChange({ operatorId: e.target.value })}>
              {!operators.some((o) => o.id === draft.operatorId) && (
                <option value={draft.operatorId}>(other)</option>
              )}
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.display_name}
                  {o.call_sign ? ` (${o.call_sign})` : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        {operatorNote && <p className="settings-hint activity-form-note">{operatorNote}</p>}
        {rangeCheck && repeaterField}
      </Section>

      {/* A station log is ongoing, so it has no date or time. */}
      {!isLog(draft.type) && (
        <Section title="When">
          <Field label="Date">{text("date", "YYYY-MM-DD")}</Field>
          <Field label="Time">{text("time", "19:00 (optional)")}</Field>
        </Section>
      )}

      {(showStarted || showEnded) && (
        <Section title="Actual times">
          {showStarted && <Field label="Started">{text("started", "YYYY-MM-DD HH:MM")}</Field>}
          {showEnded && <Field label="Ended">{text("ended", "YYYY-MM-DD HH:MM")}</Field>}
        </Section>
      )}

      <Section title="Radio">
        {/* The repeater first: picking one from the directory fills in the frequency. */}
        {!rangeCheck && !isRelay(draft.type) && repeaterField}
        <Field label="Frequency" wide>
          {text("frequency", "e.g. 146.940 -0.6 PL 100.0")}
        </Field>
      </Section>

      {!isLog(draft.type) && (
      <Section title="Net control">
        <div className="activity-field activity-field-wide">
          <span className="activity-field-label">Location</span>
          <div className="inline-form">
            <span>
              {draft.location ? (
                <strong>
                  {draft.location.label ? `${draft.location.label} — ` : ""}
                  {formatCoordsWithGrid(draft.location.lat, draft.location.lon)}
                </strong>
              ) : operatorLocation ? (
                <>
                  {operatorLocation.label}{" "}
                  <span className="settings-hint">(the operator's location)</span>
                </>
              ) : (
                <span className="settings-hint">None — the operator has no location set either</span>
              )}
            </span>
            <button type="button" onClick={() => setPlacing(true)}>
              {draft.location ? "Change…" : "Set a different location…"}
            </button>
            {draft.location && (
              <button type="button" className="link-button" onClick={() => onChange({ location: null })}>
                Use the operator's location
              </button>
            )}
          </div>
        </div>
      </Section>
      )}

      <div className="inline-form create-activity-actions">
        <button
          className="primary"
          onClick={onSubmit}
          disabled={missingRepeater}
          title={missingRepeater ? "Set the repeater first" : undefined}
        >
          {submitLabel}
        </button>
        {onCancel && <button onClick={onCancel}>Cancel</button>}
        {error && <span className="weather-area-error">{error}</span>}
      </div>

      {placing && (
        <LocationPicker
          title={`Net control location — ${mapTitle}`}
          initialLat={draft.location?.lat ?? operatorLocation?.lat ?? null}
          initialLon={draft.location?.lon ?? operatorLocation?.lon ?? null}
          initialLabel={draft.location?.label ?? ""}
          onSave={(lat, lon, label) => {
            onChange({ location: { lat, lon, label } });
            setPlacing(false);
          }}
          onClear={
            draft.location
              ? () => {
                  onChange({ location: null });
                  setPlacing(false);
                }
              : undefined
          }
          onClose={() => setPlacing(false)}
        />
      )}
    </div>
  );
}
