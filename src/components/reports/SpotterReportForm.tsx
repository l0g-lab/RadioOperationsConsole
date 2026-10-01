import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Checkin, SpotterReport } from "../../types";
import {
  HAZARD_TYPES,
  HAZARD_MAGNITUDE_OPTIONS,
  REPORT_SOURCES,
  WIND_DAMAGE_GUIDE,
} from "../../types";
import { formatCoordsWithGrid } from "../../geo";
import { nowLocalInputValue } from "../../utils";
import LocationPicker from "../LocationPicker";
import { ClipboardPen } from "lucide-react";

interface Props {
  activityId: string;
  operatorId: string | null;
  checkins: Checkin[];
  editingReport: SpotterReport | null;
  onSaved: (newId?: string) => void;
  onCancelEdit: () => void;
}

function checkinLabel(c: Checkin): string {
  return c.name ? `${c.call_sign.toUpperCase()} (${c.name})` : c.call_sign.toUpperCase();
}

/** Combined create/edit form for a spotter report — switches to edit mode whenever `editingReport` is set. */
export default function SpotterReportForm({
  activityId,
  operatorId,
  checkins,
  editingReport,
  onSaved,
  onCancelEdit,
}: Props) {
  const [reportedAt, setReportedAt] = useState(nowLocalInputValue());
  const [county, setCounty] = useState("");
  const [locationText, setLocationText] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [reporter, setReporter] = useState("");
  const [hazardType, setHazardType] = useState<string>(HAZARD_TYPES[0]);
  const [magnitude, setMagnitude] = useState("");
  const [magnitudeCustom, setMagnitudeCustom] = useState(
    HAZARD_MAGNITUDE_OPTIONS[HAZARD_TYPES[0]].length === 0
  );
  const [source, setSource] = useState<string>(REPORT_SOURCES[0]);
  const [notes, setNotes] = useState("");
  const [checkinId, setCheckinId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Set once Save is attempted, so the list of what's missing only appears
  // then (and updates live as the fields are filled in).
  const [attempted, setAttempted] = useState(false);

  const missing = missingParts();

  function missingParts(): { part: "who" | "what" | "where"; text: string }[] {
    const out: { part: "who" | "what" | "where"; text: string }[] = [];
    if (!reporter.trim())
      out.push({ part: "who", text: "who reported it (reporter name or call sign)" });
    if (!hazardType || !magnitude.trim()) {
      out.push({ part: "what", text: "what was seen (hazard type and magnitude)" });
    }
    if (!county.trim() && !locationText.trim() && (lat == null || lon == null)) {
      out.push({ part: "where", text: "where (county, intersection, or a point on the map)" });
    }
    return out;
  }

  function sectionClass(part: "who" | "what" | "where"): string {
    return attempted && missing.some((m) => m.part === part) ? " report-entry-section-error" : "";
  }

  function resetForm() {
    setAttempted(false);
    setReportedAt(nowLocalInputValue());
    setCounty("");
    setLocationText("");
    setLat(null);
    setLon(null);
    setReporter("");
    setHazardType(HAZARD_TYPES[0]);
    setMagnitude("");
    setMagnitudeCustom(HAZARD_MAGNITUDE_OPTIONS[HAZARD_TYPES[0]].length === 0);
    setSource(REPORT_SOURCES[0]);
    setNotes("");
    setCheckinId(null);
  }

  // Populates the form when an edit is requested (from the roster) and
  // resets it back to defaults whenever editing ends, whether by saving,
  // cancelling, or switching activities.
  useEffect(() => {
    if (!editingReport) {
      resetForm();
      return;
    }
    setReportedAt(editingReport.reported_at);
    setCounty(editingReport.county);
    setLocationText(editingReport.location_text);
    setLat(editingReport.lat);
    setLon(editingReport.lon);
    setReporter(editingReport.reporter);
    const type = editingReport.hazard_type || HAZARD_TYPES[0];
    setHazardType(type);
    setMagnitude(editingReport.magnitude);
    const options = HAZARD_MAGNITUDE_OPTIONS[type] ?? [];
    setMagnitudeCustom(
      options.length === 0 ||
        (!!editingReport.magnitude && !options.includes(editingReport.magnitude))
    );
    setSource(editingReport.source || REPORT_SOURCES[0]);
    setNotes(editingReport.notes);
    setCheckinId(editingReport.checkin_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingReport?.id]);

  // Magnitude options depend on hazard type (e.g. hail sizes vs. wind
  // speeds). Switching type only resets the magnitude when the current
  // value wouldn't make sense under the new type's list, so picking the
  // wrong type first and correcting it doesn't need re-entering magnitude.
  function handleHazardTypeChange(newType: string) {
    setHazardType(newType);
    const options = HAZARD_MAGNITUDE_OPTIONS[newType] ?? [];
    if (!options.includes(magnitude)) {
      setMagnitude("");
      setMagnitudeCustom(options.length === 0);
    }
  }

  async function handleSaveReport() {
    setAttempted(true);
    if (missing.length > 0) return;
    if (editingReport) {
      await api.updateSpotterReport(
        editingReport.id,
        reportedAt,
        county.trim() || null,
        locationText.trim() || null,
        lat,
        lon,
        reporter.trim() || null,
        hazardType,
        magnitude.trim() || null,
        source || null,
        notes.trim() || null,
        checkinId,
        operatorId
      );
      resetForm();
      onSaved();
    } else {
      const id = await api.createSpotterReport(
        activityId,
        reportedAt,
        county.trim() || null,
        locationText.trim() || null,
        lat,
        lon,
        reporter.trim() || null,
        hazardType,
        magnitude.trim() || null,
        source || null,
        notes.trim() || null,
        checkinId,
        operatorId
      );
      resetForm();
      onSaved(id);
    }
  }

  return (
    <div
      className="checkin-entry"
      onKeyDown={(e) => {
        // Enter in any text field saves, like the check-in form. Buttons keep
        // their own Enter behaviour, and the map picker's fields are its own.
        if (e.key !== "Enter" || showPicker || e.nativeEvent.isComposing) return;
        const el = e.target as HTMLElement;
        if (el.tagName !== "INPUT") return;
        e.preventDefault();
        handleSaveReport();
      }}
    >
      <h3><ClipboardPen className="heading-icon" />{editingReport ? "Edit Spotter Report" : "New Spotter Report"}</h3>

      <div className={"report-entry-section" + sectionClass("who")}>
        <span className="report-entry-section-label">Who</span>
        <div className="inline-form">
          <input
            className="report-input-reporter"
            placeholder="Reporter — name or call sign"
            value={reporter}
            onChange={(e) => setReporter(e.target.value)}
          />
          <label>
            Linked check-in (optional):
            <select
              value={checkinId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                // Only follow the reporter field along with the dropdown
                // when it still holds exactly what we auto-filled for
                // the previously linked check-in (or is empty) — once
                // the operator edits it by hand, switching the link
                // must not clobber their edit.
                const previousCheckin = checkinId ? checkins.find((c) => c.id === checkinId) : null;
                const reporterIsAutoFilled =
                  !reporter.trim() ||
                  (previousCheckin && reporter === checkinLabel(previousCheckin));
                setCheckinId(id);
                if (reporterIsAutoFilled) {
                  const c = id ? checkins.find((c) => c.id === id) : null;
                  setReporter(c ? checkinLabel(c) : "");
                }
              }}
            >
              <option value="">&lt;none&gt;</option>
              {checkins.map((c) => (
                <option key={c.id} value={c.id}>
                  {checkinLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source:
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {REPORT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        {checkinId && (
          <p className="settings-hint">
            Linked to the check-in from{" "}
            {checkins.find((c) => c.id === checkinId)?.call_sign.toUpperCase() ?? "this station"} —
            correlates this report with that roster entry.
          </p>
        )}
      </div>

      <div className={"report-entry-section" + sectionClass("what")}>
        <span className="report-entry-section-label">What</span>
        <div className="inline-form">
          <label>
            Time:
            <input
              type="datetime-local"
              value={reportedAt}
              onChange={(e) => setReportedAt(e.target.value)}
            />
          </label>
          <label>
            Hazard type:
            <select value={hazardType} onChange={(e) => handleHazardTypeChange(e.target.value)}>
              {HAZARD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {(() => {
            const options = HAZARD_MAGNITUDE_OPTIONS[hazardType] ?? [];
            if (options.length > 0 && !magnitudeCustom) {
              return (
                <label>
                  Magnitude:
                  <select
                    value={magnitude}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setMagnitude("");
                        setMagnitudeCustom(true);
                      } else {
                        setMagnitude(e.target.value);
                      }
                    }}
                  >
                    <option value="">&lt;none&gt;</option>
                    {options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                    <option value="__custom__">Other / describe…</option>
                  </select>
                </label>
              );
            }
            return (
              <>
                <input
                  placeholder="Magnitude — describe severity"
                  value={magnitude}
                  onChange={(e) => setMagnitude(e.target.value)}
                />
                {options.length > 0 && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setMagnitudeCustom(false);
                      setMagnitude("");
                    }}
                  >
                    Use standard list
                  </button>
                )}
              </>
            );
          })()}
        </div>
        <input
          className="report-notes-input"
          placeholder="Details — e.g. two trees down, road blocked (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {hazardType === "Wind Damage" && (
          <details className="report-wind-guide" open>
            <summary>Wind speed / damage guide — ask the caller what they saw</summary>
            <table>
              <tbody>
                {WIND_DAMAGE_GUIDE.map((entry) => (
                  <tr key={entry.range}>
                    <td className="report-wind-guide-range">{entry.range}</td>
                    <td className="report-wind-guide-label">{entry.label}</td>
                    <td>{entry.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      <div className={"report-entry-section" + sectionClass("where")}>
        <span className="report-entry-section-label">Where</span>
        <div className="inline-form">
          <input
            className="report-input-county"
            placeholder="County (optional)"
            value={county}
            onChange={(e) => setCounty(e.target.value)}
          />
          <input
            className="report-input-intersection"
            placeholder="Intersection — address, cross streets, or landmark"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
          />
          <button onClick={() => setShowPicker(true)}>Pick location on map / GPS</button>
        </div>
        {lat != null && lon != null && (
          <p className="weather-area-status">
            Coordinates: {formatCoordsWithGrid(lat, lon)}{" "}
            <button
              className="link-button"
              onClick={() => {
                setLat(null);
                setLon(null);
              }}
            >
              Clear
            </button>
          </p>
        )}
      </div>

      <div className="report-entry-actions">
        <button onClick={handleSaveReport}>
          {editingReport ? "Update report" : "Save report"}
        </button>
        {editingReport && <button onClick={onCancelEdit}>Cancel</button>}
        {attempted && missing.length > 0 && (
          <span className="weather-area-error" role="alert">
            Can't save yet — still needed: {missing.map((m) => m.text).join("; ")}.
          </span>
        )}
      </div>

      {showPicker && (
        <LocationPicker
          title="Spotter Report Location"
          initialLat={lat}
          initialLon={lon}
          initialLabel={locationText}
          onSave={(newLat, newLon, label) => {
            setLat(newLat);
            setLon(newLon);
            if (!locationText.trim()) setLocationText(label);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
