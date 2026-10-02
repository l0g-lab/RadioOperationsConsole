import { useState } from "react";
import type { NetListingDetails, Repeater, ScheduleKind } from "../../types";
import { formatRepeater } from "../../repeaters";
import { describeSchedule, WEEK_OPTIONS, WEEKDAY_OPTIONS } from "../../netSchedule";
import ActivityTypeSelect from "../operations/ActivityTypeSelect";

export const EMPTY_LISTING: NetListingDetails = {
  name: "",
  activity_type: "directed_net",
  repeater_id: null,
  frequency: "",
  schedule_kind: "weekly",
  weekdays: [],
  weeks: [],
  start_time: "",
  end_time: "",
  run_by: "",
  checkin_info: "",
  notes: "",
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Why the listing can't be saved yet, or null (NETL-001–004). The backend checks the same. */
export function listingProblem(d: NetListingDetails): string | null {
  if (!d.name.trim()) return "Give the net a name.";
  if (d.schedule_kind === "as_needed") return null;
  if (d.weekdays.length === 0) return "Choose the day or days the net meets.";
  if (d.schedule_kind === "monthly" && d.weeks.length === 0)
    return "Choose which weeks of the month it meets.";
  if (!TIME.test(d.start_time.trim())) return "Enter the start time as HH:MM, for example 19:00.";
  if (d.end_time.trim()) {
    if (!TIME.test(d.end_time.trim())) return "Enter the end time as HH:MM, or leave it blank.";
    if (d.end_time.trim() <= d.start_time.trim()) return "The end time should be after the start time.";
  }
  return null;
}

/** Toggles a value in a list, keeping it sorted the way `order` lists them. */
function toggle<T>(list: T[], value: T, order: T[]): T[] {
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return order.filter((v) => next.includes(v));
}

/** Adding or editing a net listing. */
export default function NetListingForm({
  initial,
  repeaters,
  onSave,
  onCancel,
}: {
  initial: NetListingDetails;
  /** Repeaters to choose from (a retired one already on the listing is included). */
  repeaters: Repeater[];
  onSave: (d: NetListingDetails) => Promise<void>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<NetListingDetails>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<NetListingDetails>) => setD((prev) => ({ ...prev, ...patch }));
  const scheduled = d.schedule_kind !== "as_needed";

  async function save() {
    const problem = listingProblem(d);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      await onSave({ ...d, start_time: d.start_time.trim(), end_time: d.end_time.trim() });
    } catch (e) {
      setError(String(e));
    }
  }

  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") onCancel();
  };
  const problem = listingProblem(d);

  return (
    <div className="repeater-form net-form">
      <input
        autoFocus
        aria-label="Net name"
        placeholder="Net name, e.g. Tuesday Night Net"
        value={d.name}
        onChange={(e) => set({ name: e.target.value })}
        onKeyDown={enter}
      />
      <div className="inline-form">
        <label>
          Repeater
          <select
            aria-label="Repeater"
            value={d.repeater_id ?? ""}
            onChange={(e) => set({ repeater_id: e.target.value || null })}
          >
            <option value="">Not in the directory — type a frequency</option>
            {repeaters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {formatRepeater(r)}
                {r.retired_at ? " (retired)" : ""}
              </option>
            ))}
          </select>
        </label>
        {!d.repeater_id && (
          <input
            aria-label="Frequency"
            placeholder="Frequency, e.g. 146.520 simplex or 3.940 LSB"
            value={d.frequency}
            onChange={(e) => set({ frequency: e.target.value })}
            onKeyDown={enter}
          />
        )}
      </div>
      <div className="inline-form" role="radiogroup" aria-label="Schedule">
        {(
          [
            ["weekly", "Weekly"],
            ["monthly", "Monthly"],
            ["as_needed", "As needed"],
          ] as [ScheduleKind, string][]
        ).map(([kind, label]) => (
          <label key={kind} className="checkbox-row">
            <input
              type="radio"
              name="net-schedule"
              checked={d.schedule_kind === kind}
              onChange={() => set({ schedule_kind: kind })}
            />
            {label}
          </label>
        ))}
      </div>
      {scheduled && (
        <>
          {d.schedule_kind === "monthly" && (
            <div className="net-choices" role="group" aria-label="Weeks of the month">
              {WEEK_OPTIONS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  aria-pressed={d.weeks.includes(w.value)}
                  className={d.weeks.includes(w.value) ? "range-kind-chosen" : undefined}
                  onClick={() =>
                    set({ weeks: toggle(d.weeks, w.value, WEEK_OPTIONS.map((o) => o.value)) })
                  }
                >
                  {w.label}
                </button>
              ))}
            </div>
          )}
          <div className="net-choices" role="group" aria-label="Days">
            {WEEKDAY_OPTIONS.map((w) => (
              <button
                key={w.value}
                type="button"
                aria-pressed={d.weekdays.includes(w.value)}
                className={d.weekdays.includes(w.value) ? "range-kind-chosen" : undefined}
                onClick={() =>
                  set({ weekdays: toggle(d.weekdays, w.value, WEEKDAY_OPTIONS.map((o) => o.value)) })
                }
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="inline-form">
            <label>
              Start
              <input
                aria-label="Start time"
                className="repeater-mhz"
                placeholder="19:00"
                value={d.start_time}
                onChange={(e) => set({ start_time: e.target.value })}
                onKeyDown={enter}
              />
            </label>
            <label>
              End (optional)
              <input
                aria-label="End time"
                className="repeater-mhz"
                placeholder="19:30"
                value={d.end_time}
                onChange={(e) => set({ end_time: e.target.value })}
                onKeyDown={enter}
              />
            </label>
            <span className="settings-hint">This computer's local time.</span>
          </div>
        </>
      )}
      <input
        aria-label="Run by"
        placeholder="Run by (net manager or group, optional)"
        value={d.run_by}
        onChange={(e) => set({ run_by: e.target.value })}
        onKeyDown={enter}
      />
      <input
        aria-label="Check-in instructions"
        placeholder="How to check in (e.g. call sign and name, mobiles first, check-ins start at 19:05)"
        value={d.checkin_info}
        onChange={(e) => set({ checkin_info: e.target.value })}
        onKeyDown={enter}
      />
      <input
        aria-label="Notes"
        placeholder="Notes (e.g. not on holidays, 5th Thursday is a social net)"
        value={d.notes}
        onChange={(e) => set({ notes: e.target.value })}
        onKeyDown={enter}
      />
      <fieldset className="net-run-section">
        <legend>If you run this net</legend>
        <ActivityTypeSelect value={d.activity_type} onChange={(activity_type) => set({ activity_type })} />
        <span className="settings-hint">Used when you start an activity from it.</span>
      </fieldset>
      {!problem && (
        <p className="settings-hint">
          Meets: <strong>{describeSchedule(d)}</strong>
        </p>
      )}
      {error && <p className="weather-area-error">{error}</p>}
      <div className="inline-form">
        <button onClick={save}>Save net</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
