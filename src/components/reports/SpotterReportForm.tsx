import { useEffect, useRef, useState } from "react";
import * as api from "../../api";
import type { Checkin, SpotterReport } from "../../types";
import {
  HAZARD_TYPES,
  HAZARD_MAGNITUDE_OPTIONS,
  REPORT_SOURCES,
  WIND_DAMAGE_GUIDE,
} from "../../types";
import { formatContactTime, parseContactTime } from "../../utils";
import {
  placeReportLater,
  resolveCheckinLocation,
  type CheckinLocation,
} from "../../checkinLocation";
import type { MapPoint } from "../../mapPoints";
import { callSignService } from "../../callsignLookup";
import { checkInCallSign } from "../../quickCheckin";
import LocationPicker from "../LocationPicker";
import SuggestInput, { earlierEntries } from "../SuggestInput";
import { ClipboardPen, MapPin } from "lucide-react";

interface Props {
  activityId: string;
  operatorId: string | null;
  checkins: Checkin[];
  /** Counties named in the activity's reports so far, suggested as you type. */
  counties?: string[];
  editingReport: SpotterReport | null;
  /**
   * Start a new report from this check-in (its row's Report button): the
   * station as reporter, linked, and any traffic not yet handled as the
   * details. `n` changes to start again for the same station (SPOT-024).
   */
  startFrom?: { checkin: Checkin; n: number } | null;
  /** For looking up a reporter checked in from here (SPOT-025). */
  qrzConfigured?: boolean;
  /** Where the net is: typed places are looked up near it once saved (LOCRES-050). */
  near?: MapPoint | null;
  onSaved: (newId?: string) => void;
  onCancelEdit: () => void;
}

function checkinLabel(c: Checkin): string {
  return c.name ? `${c.call_sign.toUpperCase()} (${c.name})` : c.call_sign.toUpperCase();
}

/**
 * Checked-in stations for what's typed in the Reporter box: call signs
 * starting with it first, then names with a word starting with it. Each
 * station once; nothing for an empty box or a call sign already typed in full.
 */
export function reporterSuggestions(typed: string, checkins: Checkin[]): Checkin[] {
  const t = typed.trim().toLowerCase();
  if (!t) return [];
  const stations = new Map<string, Checkin>();
  for (const c of checkins) {
    const call = c.call_sign.toUpperCase();
    if (!stations.has(call)) stations.set(call, c);
  }
  const all = [...stations.values()];
  const byCall = all.filter((c) => c.call_sign.toLowerCase().startsWith(t));
  const byName = all.filter(
    (c) => !byCall.includes(c) && (c.name ?? "").toLowerCase().split(/\s+/).some((w) => w.startsWith(t))
  );
  const matches = [...byCall, ...byName].slice(0, 8);
  return matches.length === 1 && matches[0].call_sign.toLowerCase() === t ? [] : matches;
}

/** The check-in a Reporter box names: its call sign, or "CALL (Name)" as earlier reports were saved. */
export function linkedCheckin(reporter: string, checkins: Checkin[]): Checkin | null {
  const r = reporter.trim().toUpperCase();
  if (!r) return null;
  return (
    checkins.find((c) => c.call_sign.toUpperCase() === r) ??
    checkins.find((c) => checkinLabel(c).toUpperCase() === r) ??
    null
  );
}

/**
 * Whether the Reporter box holds one call sign (W4ABC, WRAB123), so a reporter
 * not on the roster can be checked in from the report (SPOT-025); a name or
 * "Orange County EM" can't.
 */
export function reporterIsCallSign(reporter: string): boolean {
  const r = reporter.trim();
  return r !== "" && !/\s/.test(r) && callSignService(r) !== "unknown";
}

/**
 * A report as a check-in line's traffic, for the roster and the ICS 309:
 * "Hail 1.00 in (Quarter), Main & 5th, Orange Co." (SPOT-026).
 */
export function reportTrafficText(hazard: string, magnitude: string, location: string, county: string): string {
  const what = [hazard, magnitude.replace(/\s*—\s*Severe threshold$/, "").trim()].filter(Boolean).join(" ");
  return [what, location.trim(), county.trim() && `${county.trim()} Co.`].filter(Boolean).join(", ");
}

/** Combined create/edit form for a spotter report — switches to edit mode whenever `editingReport` is set. */
export default function SpotterReportForm({
  activityId,
  operatorId,
  checkins,
  counties = [],
  editingReport,
  startFrom = null,
  qrzConfigured = false,
  near = null,
  onSaved,
  onCancelEdit,
}: Props) {
  // When it happened, as typed ("YYYY-MM-DD HH:MM", or "HH:MM" for today); blank is now.
  const [timeText, setTimeText] = useState("");
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
  const [saving, setSaving] = useState(false);
  const hazardRef = useRef<HTMLSelectElement>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Where the Location box will put it on the map, as for check-ins.
  const [preview, setPreview] = useState<CheckinLocation | null>(null);
  const pin = lat != null && lon != null ? { lat, lon, label: locationText } : null;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      resolveCheckinLocation(locationText, { pin, near }).then((r) => {
        if (!cancelled) setPreview(r.note ? r : null);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationText, lat, lon]);

  /**
   * Reporter typed or picked. A new report from a call sign gets a check-in
   * line of its own (SPOT-026), so it isn't linked to an earlier one here;
   * that's what a roster row's Report is for. A report being corrected keeps
   * following the station named.
   */
  function changeReporter(value: string) {
    setReporter(value);
    setCheckinId(editingReport ? (linkedCheckin(value, checkins)?.id ?? null) : null);
  }

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
    setTimeText("");
    setError(null);
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
    setTimeText(formatContactTime(editingReport.reported_at));
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

  // After the reset above, so a form opened already holding one isn't wiped.
  // A roster row's Report: that station, linked, with its traffic (if not yet
  // handled) as the details; the hazard is next. The traffic stays open until
  // it's ticked Handled on the roster, once passed on (SPOT-024).
  useEffect(() => {
    if (!startFrom || editingReport) return;
    const c = startFrom.checkin;
    resetForm();
    setReporter(c.call_sign.toUpperCase());
    setCheckinId(c.id);
    if (c.has_traffic && !c.traffic_handled) setNotes(c.traffic);
    hazardRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startFrom?.n]);

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

  // A new report from a call sign, not taken with a row's Report: it gets a
  // check-in line of its own, so the roster and ICS 309 show the call when
  // it was taken (SPOT-025, SPOT-026).
  const newLine = !editingReport && !checkinId && reporterIsCallSign(reporter);
  const linked = checkins.find((x) => x.id === checkinId) ?? null;
  // The station's latest line, if it's on the roster: the new one goes where it was.
  const onRoster = newLine ? linkedCheckin(reporter, checkins) : null;

  async function handleSaveReport() {
    setAttempted(true);
    if (missing.length > 0 || saving) return;
    const time = parseContactTime(timeText);
    if (time.kind === "invalid") {
      setError(`"${timeText}" isn't a time. Use YYYY-MM-DD HH:MM, or HH:MM for today; blank for now.`);
      return;
    }
    setError(null);
    const reportedAt = time.kind === "ok" ? time.iso : new Date().toISOString();
    // A point picked on the map stays; otherwise the Location box is placed
    // as for a check-in (coordinates, mile marker, ZIP), and what isn't
    // placed exactly is looked up online once saved (LOCRES-050).
    let where = { lat, lon };
    let later: CheckinLocation | null = null;
    if (!pin && locationText.trim()) {
      later = await resolveCheckinLocation(locationText, { near });
      where = { lat: later.lat, lon: later.lon };
    }
    const [lat2, lon2] = [where.lat, where.lon];
    if (editingReport) {
      await api.updateSpotterReport(
        editingReport.id,
        reportedAt,
        county.trim() || null,
        locationText.trim() || null,
        lat2,
        lon2,
        reporter.trim() || null,
        hazardType,
        magnitude.trim() || null,
        source || null,
        notes.trim() || null,
        checkinId,
        operatorId
      );
      if (later) placeReportLater(editingReport.id, locationText, later, near);
      resetForm();
      onSaved();
    } else {
      setSaving(true);
      try {
        let linkTo = checkinId;
        let who = reporter.trim();
        if (newLine) {
          who = who.toUpperCase();
          const traffic = reportTrafficText(hazardType, magnitude, locationText, county);
          // Already on the roster: the same station again, where it was last
          // placed. Otherwise a check-in as from the form, looked up.
          linkTo = onRoster
            ? await api.createCheckin(
                activityId,
                onRoster.call_sign.toUpperCase(),
                onRoster.name || null,
                onRoster.qth_location || null,
                onRoster.grid_square || null,
                onRoster.address || null,
                operatorId,
                onRoster.location_lat,
                onRoster.location_lon,
                onRoster.location_label || null,
                true,
                traffic,
                null,
                onRoster.location_manual
              )
            : await checkInCallSign(activityId, who, operatorId, qrzConfigured, traffic, near);
          // Open, like any traffic, until ticked Handled once it's passed on.
        }
        const id = await api.createSpotterReport(
          activityId,
          reportedAt,
          county.trim() || null,
          locationText.trim() || null,
          lat2,
          lon2,
          who || null,
          hazardType,
          magnitude.trim() || null,
          source || null,
          notes.trim() || null,
          linkTo,
          operatorId
        );
        if (later) placeReportLater(id, locationText, later, near);
        resetForm();
        onSaved(id);
      } catch (e) {
        setError(String(e));
      } finally {
        setSaving(false);
      }
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
      <div className="activity-form report-form">

      <div className={"activity-form-section" + sectionClass("who")}>
        <span className="activity-form-section-title">Who</span>
        <div className="activity-form-fields">
          <label className="activity-field activity-field-wide">
            <span className="activity-field-label">Reporter</span>
            <SuggestInput
              id="report-reporter"
              listLabel="Checked-in stations"
              autoFocus
              placeholder="Name or call sign — Tab fills in a station checked in"
              value={reporter}
              onChange={changeReporter}
              suggest={(typed) =>
                reporterSuggestions(typed, checkins).map((c) => ({
                  value: c.call_sign.toUpperCase(),
                  label: (
                    <>
                      <span className="suggest-call">{c.call_sign.toUpperCase()}</span>
                      {c.name && <span className="suggest-detail">{c.name}</span>}
                    </>
                  ),
                }))
              }
            />
          </label>
          <label className="activity-field">
            <span className="activity-field-label">Source</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {REPORT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {newLine && (
            <p className="settings-hint activity-form-note">
              {onRoster
                ? `Saving logs a new check-in for ${reporter.trim().toUpperCase()}, so this call has its own line on the roster and ICS 309. To add it to a check-in already there, use Report on that row.`
                : `Saving checks in ${reporter.trim().toUpperCase()} too — not on this net's roster yet.`}
            </p>
          )}
          {checkinId && (
            <p className="settings-hint activity-form-note">
              Linked to {linked ? checkinLabel(linked) : "a station"}'s check-in.
            </p>
          )}
        </div>
      </div>

      <div className={"activity-form-section" + sectionClass("what")}>
        <span className="activity-form-section-title">What</span>
        <div className="activity-form-fields">
          <label className="activity-field">
            <span className="activity-field-label">Time</span>
            <input
              value={timeText}
              placeholder="now"
              title="YYYY-MM-DD HH:MM, or HH:MM for today. Blank for now."
              aria-invalid={parseContactTime(timeText).kind === "invalid"}
              onChange={(e) => setTimeText(e.target.value)}
            />
          </label>
          <label className="activity-field">
            <span className="activity-field-label">Hazard</span>
            <select ref={hazardRef} value={hazardType} onChange={(e) => handleHazardTypeChange(e.target.value)}>
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
                <label className="activity-field">
                  <span className="activity-field-label">Magnitude</span>
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
              <label className="activity-field activity-field-wide">
                <span className="activity-field-label">
                  Magnitude{" "}
                  {options.length > 0 && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setMagnitudeCustom(false);
                        setMagnitude("");
                      }}
                    >
                      use the standard list
                    </button>
                  )}
                </span>
                <input
                  placeholder="Describe the severity"
                  value={magnitude}
                  onChange={(e) => setMagnitude(e.target.value)}
                />
              </label>
            );
          })()}
          <label className="activity-field activity-field-wide activity-field-row">
            <span className="activity-field-label">Details (optional)</span>
            <input
              className="report-notes-input"
              placeholder="e.g. two trees down, road blocked"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {hazardType === "Wind Damage" && (
            <details className="report-wind-guide activity-field-row" open>
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
      </div>

      <div className={"activity-form-section" + sectionClass("where")}>
        <span className="activity-form-section-title">Where</span>
        <div className="activity-form-fields">
          <label className="activity-field activity-field-wide">
            <span className="activity-field-label">Location</span>
            <input
              placeholder="Intersection, address, landmark, MM 182 turnpike, or lat, lon"
              value={locationText}
              onChange={(e) => {
                setLocationText(e.target.value);
                // A typed location replaces a point picked for the old one.
                setLat(null);
                setLon(null);
              }}
            />
          </label>
          <label className="activity-field">
            <span className="activity-field-label">County</span>
            <SuggestInput
              id="report-county"
              listLabel="Counties"
              placeholder="e.g. Orange"
              value={county}
              onChange={setCounty}
              suggest={(t) => earlierEntries(t, counties)}
            />
          </label>
          <div className="activity-field">
            <span className="activity-field-label">&nbsp;</span>
            <button type="button" onClick={() => setShowPicker(true)} title="Pick the exact spot on a map">
              <MapPin className="button-icon" /> Map
            </button>
          </div>
          {preview && (
            <p className={"settings-hint activity-form-note" + (preview.lat == null ? " checkin-location-unplaced" : "")}>
              Map:{" "}
              {preview.note}
              {preview.grid ? ` · grid ${preview.grid}` : ""}
            </p>
          )}
        </div>
      </div>

      </div>
      <div className="report-entry-actions">
        <button className="primary" onClick={handleSaveReport} disabled={saving}>
          {editingReport ? "Update report" : "Save report"}
        </button>
        {editingReport && <button onClick={onCancelEdit}>Cancel</button>}
        {attempted && missing.length > 0 && (
          <span className="weather-area-error" role="alert">
            Can't save yet — still needed: {missing.map((m) => m.text).join("; ")}.
          </span>
        )}
        {error && (
          <span className="weather-area-error" role="alert">
            {error}
          </span>
        )}
      </div>

      {showPicker && (
        <LocationPicker
          title="Spotter Report Location"
          near={near}
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
