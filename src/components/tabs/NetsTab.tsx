import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../../api";
import type { NetListing, NetListingDetails, Operator, Repeater } from "../../types";
import { haversineKm } from "../../geo";
import { formatRepeater, tuningDetails } from "../../repeaters";
import {
  comingUp,
  describeNext,
  describeSchedule,
  isoDate,
  startsIn,
  weekAhead,
  type Meeting,
} from "../../netSchedule";
import NetListingForm, { EMPTY_LISTING } from "../nets/NetListingForm";
import type { ActivityPrefill } from "../operations/activityPrefill";
import { shortMiles } from "../checkins/roster/shared";
import { CalendarClock, Info, Play } from "lucide-react";
import ActivityTypeIcon from "../ActivityTypeIcon";
import { useMinuteClock } from "../../hooks/useMinuteClock";
import { mhzFromText } from "../../bands";
import BandChip from "../BandChip";
import ShareListControls from "../ShareListControls";

interface Props {
  operators: Operator[];
  /** The current operator: their location gives each repeater's distance, and they're recorded on changes. */
  selectedOperatorId: string | null;
  /** Opens the create-activity form filled from a listing (NETL-030). */
  onStartActivity: (prefill: ActivityPrefill) => void;
}

/** A listing's details, for the form. */
function detailsOf(l: NetListing): NetListingDetails {
  const { id: _id, retired_at: _retired, ...details } = l;
  return details;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * A reference of the nets in the area — when each meets, how to tune in,
 * and how to check in — with the option to start an activity from one
 * (net-listings.md).
 */
export default function NetsTab({ operators, selectedOperatorId, onStartActivity }: Props) {
  const [listings, setListings] = useState<NetListing[]>([]);
  const [retired, setRetired] = useState<NetListing[]>([]);
  const [repeaters, setRepeaters] = useState<Repeater[]>([]);
  // null: not editing; "new": adding; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [repeaterFilter, setRepeaterFilter] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rows with their details open, by day and net.
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const now = useMinuteClock();

  function toggleRow(key: string) {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const refresh = useCallback(() => {
    api.listNetListings().then(setListings).catch(() => setListings([]));
    api.listNetListings(true).then(setRetired).catch(() => setRetired([]));
    // Retired repeaters too: a listing keeps one it already names (NETL-002).
    Promise.all([api.listRepeaters(), api.listRepeaters(true)])
      .then(([inUse, old]) => setRepeaters([...inUse, ...old]))
      .catch(() => setRepeaters([]));
  }, []);
  useEffect(refresh, [refresh]);

  const repeaterById = useMemo(() => new Map(repeaters.map((r) => [r.id, r])), [repeaters]);
  const inUseRepeaters = repeaters.filter((r) => !r.retired_at);
  const operator = operators.find((o) => o.id === selectedOperatorId);
  const here =
    operator?.location_lat != null && operator.location_lon != null
      ? { lat: operator.location_lat, lon: operator.location_lon }
      : null;

  const repeaterOf = (l: NetListingDetails) =>
    l.repeater_id ? repeaterById.get(l.repeater_id) : undefined;

  const query = search.trim().toLowerCase();
  const matching = listings.filter((l) => {
    if (repeaterFilter && l.repeater_id !== repeaterFilter) return false;
    if (!query) return true;
    const r = repeaterOf(l);
    return [l.name, l.run_by, l.frequency, r ? `${r.name} ${formatRepeater(r)}` : ""].some((v) =>
      v.toLowerCase().includes(query)
    );
  });
  const week = weekAhead(matching, now);
  const next = comingUp(week);
  const editingListing = listings.find((l) => l.id === editing) ?? null;

  async function save(id: string | null, details: NetListingDetails) {
    await api.saveNetListing(id, details, selectedOperatorId);
    setEditing(null);
    refresh();
  }

  async function setRetiredState(l: NetListing, retire: boolean) {
    setError(null);
    try {
      await api.setNetListingRetired(l.id, retire, selectedOperatorId);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  function start(l: NetListing, meeting: Meeting | null) {
    const r = repeaterOf(l);
    onStartActivity({
      title: l.name,
      activityType: l.activity_type,
      // The day of the meeting it was started from; today when as needed.
      date: isoDate(meeting?.start ?? now),
      time: l.start_time,
      frequency: r ? formatRepeater(r) : l.frequency,
      repeater:
        r && r.location_lat != null && r.location_lon != null
          ? { name: r.name, lat: r.location_lat, lon: r.location_lon }
          : null,
    });
  }

  // A listing being edited may name a retired repeater; keep it choosable.
  const formRepeaters = (l: NetListingDetails) =>
    inUseRepeaters.concat(repeaters.filter((r) => r.retired_at && r.id === l.repeater_id));

  /** The repeater and its frequency on one line ("W4ABC Orlando", "146.940 -0.600 PL 100.0"), or the typed frequency. */
  function tuneLine(l: NetListing) {
    const r = repeaterOf(l);
    return (
      <span className="net-row-where">
        <BandChip mhz={r ? r.output_mhz : mhzFromText(l.frequency)} keepSpace />
        {r && <span className="net-row-repeater">{r.name}{r.retired_at ? " (retired)" : ""}</span>}
        <span className="checkin-row-mono">{r ? formatRepeater(r) : l.frequency}</span>
      </span>
    );
  }

  function startButton(l: NetListing, meeting: Meeting | null) {
    return (
      <button
        className="icon-button"
        aria-label={`Start activity for ${l.name}`}
        title="Run this net: opens a new activity filled in from it"
        onClick={() => start(l, meeting)}
      >
        <Play />
      </button>
    );
  }

  /** Everything else about a net, under its row when ⓘ is clicked (NETL-021). */
  function details(l: NetListing) {
    const r = repeaterOf(l);
    const km =
      here && r?.location_lat != null && r.location_lon != null
        ? haversineKm(here.lat, here.lon, r.location_lat, r.location_lon)
        : null;
    const facts: [string, string][] = [
      ["Meets", describeSchedule(l)],
      ["Tune", r ? tuningDetails(r) : l.frequency],
      ["Repeater", r ? `${r.name}${km != null ? ` · ${shortMiles(km)} away` : ""}` : ""],
      ["Run by", l.run_by],
      ["Check-in", l.checkin_info],
      ["Notes", l.notes],
    ];
    return (
      <div className="net-row-details">
        <dl className="summary-list">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <Fragment key={k}>
                <dt>{k}</dt>
                <dd className={k === "Tune" ? "checkin-row-mono" : undefined}>{v}</dd>
              </Fragment>
            ))}
        </dl>
        <span className="operator-row-actions">
          <button className="link-button" aria-label={`Edit ${l.name}`} onClick={() => setEditing(l.id)}>
            Edit
          </button>
          <button
            className="link-button danger-link"
            aria-label={`Retire ${l.name}`}
            title="Hide it from the list. Activities started from it don't change."
            onClick={() => setRetiredState(l, true)}
          >
            Retire
          </button>
        </span>
      </div>
    );
  }

  /** One meeting on one line: when, name, where to tune; ▶ to run it, ⓘ for the rest. */
  function row(l: NetListing, meeting: Meeting | null, when: string, key: string) {
    const open = openRows.has(key);
    return (
      <div key={key} className={"net-row" + (meeting?.underway ? " net-row-underway" : "")}>
        <span className="net-row-when checkin-row-mono">{when}</span>
        <strong className="net-row-name">
                <ActivityTypeIcon type={l.activity_type} />
                {l.name}
              </strong>
        {tuneLine(l)}
        <span className="net-row-actions">
          {startButton(l, meeting)}
          <button
            className={"icon-button" + (open ? " active" : "")}
            aria-label={`${open ? "Hide" : "Show"} details of ${l.name}`}
            aria-expanded={open}
            title={open ? "Hide details" : "Details"}
            onClick={() => toggleRow(key)}
          >
            <Info />
          </button>
        </span>
        {open && details(l)}
      </div>
    );
  }

  const timeRange = (m: Meeting, l: NetListing) => (l.end_time ? `${hhmm(m.start)}–${hhmm(m.end)}` : hhmm(m.start));

  return (
    <div className="panel nets-panel">
      <div className="panel-header-row">
        <h3>
          <CalendarClock className="heading-icon" />
          Nets
        </h3>
        <div className="checkin-roster-header-actions">
          {listings.length > 0 && (
            <input
              type="search"
              className="checkin-roster-search"
              aria-label="Search nets"
              placeholder="Search nets"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          {repeaters.some((r) => listings.some((l) => l.repeater_id === r.id)) && (
            <select aria-label="Show nets on" value={repeaterFilter} onChange={(e) => setRepeaterFilter(e.target.value)}>
              <option value="">All repeaters</option>
              {repeaters
                .filter((r) => listings.some((l) => l.repeater_id === r.id))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          )}
          {editing !== "new" && (
            <button className="link-button" onClick={() => setEditing("new")}>
              + Add net
            </button>
          )}
        </div>
      </div>
      <p className="settings-hint">
        Times are this computer's local time.
        {!here && " Set a location on your operator to see how far each repeater is."}
      </p>
      {editing === "new" && (
        <NetListingForm
          initial={EMPTY_LISTING}
          repeaters={inUseRepeaters}
          onSave={(d) => save(null, d)}
          onCancel={() => setEditing(null)}
        />
      )}
      {editingListing && (
        // Once, above the schedule, even for a net listed under several days.
        <NetListingForm
          key={editingListing.id}
          initial={detailsOf(editingListing)}
          repeaters={formRepeaters(editingListing)}
          onSave={(d) => save(editingListing.id, d)}
          onCancel={() => setEditing(null)}
        />
      )}
      {next.length > 0 && (
        <section className="net-coming-up" aria-label="Coming up">
          <h4 className="net-day-heading">Coming up</h4>
          {next.map(({ listing: l, meeting }) => (
            <div key={l.id} className={"net-coming-row" + (meeting.underway ? " net-row-underway" : "")}>
              <span
                className={
                  "net-coming-when" +
                  (meeting.underway
                    ? " net-coming-now"
                    : meeting.start.getTime() - now.getTime() < 60 * 60_000
                      ? " net-coming-soon"
                      : "")
                }
              >
                {startsIn(meeting, now)}
              </span>
              <strong className="net-row-name">
          <ActivityTypeIcon type={l.activity_type} />
          {l.name}
        </strong>
              {tuneLine(l)}
              <span className="net-row-actions">{startButton(l, meeting)}</span>
            </div>
          ))}
        </section>
      )}
      {listings.length === 0 && editing !== "new" && (
        <p className="checkin-empty-state">
          No nets listed yet. Add the nets in your area — which repeater, which days, when, and how
          to check in.
        </p>
      )}
      {listings.length > 0 && matching.length === 0 && (
        <p className="checkin-empty-state">No nets match.</p>
      )}
      {matching.length > 0 && (
        <div className="net-schedule">
          {/* Days without nets are left out. */}
          {week.days
            .filter((day) => day.entries.length > 0)
            .map((day) => (
              <section
                key={day.label}
                className={"net-day" + (day.label.startsWith("Today") ? " net-day-today" : "")}
                aria-label={day.label}
              >
                <h4 className="net-day-heading">{day.label}</h4>
                {day.entries.map((e) =>
                  row(e.listing, e.meeting, timeRange(e.meeting, e.listing), `${day.label}-${e.listing.id}`)
                )}
              </section>
            ))}
          {week.later.length > 0 && (
            <section className="net-day" aria-label="Later">
              <h4 className="net-day-heading">Later</h4>
              {week.later.map((e) =>
                row(e.listing, e.meeting, describeNext(e.meeting, now), `later-${e.listing.id}`)
              )}
            </section>
          )}
          {week.asNeeded.length > 0 && (
            <section className="net-day" aria-label="As needed">
              <h4 className="net-day-heading">As needed</h4>
              {week.asNeeded.map((l) => row(l, null, "As needed", `asneeded-${l.id}`))}
            </section>
          )}
        </div>
      )}
      {error && <p className="weather-area-error">{error}</p>}
      {retired.length > 0 && (
        <>
          <button className="link-button" onClick={() => setShowRetired((v) => !v)}>
            {showRetired ? "Hide retired" : `Show retired (${retired.length})`}
          </button>
          {showRetired &&
            retired.map((l) => (
              <div key={l.id} className="operator-row">
                <span className="settings-hint">
                  {l.name} — {describeSchedule(l)}
                </span>
                <button
                  className="link-button"
                  aria-label={`Restore ${l.name}`}
                  onClick={() => setRetiredState(l, false)}
                >
                  Restore
                </button>
              </div>
            ))}
        </>
      )}
      <ShareListControls kind="nets" selectedOperatorId={selectedOperatorId} onImported={refresh} />
    </div>
  );
}
