import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, Checkin } from "../../types";
import { QRZ_ERR_NOT_CONFIGURED, ERR_OFFLINE } from "../../types";
import { resolveOfflineLocationAsync } from "../../locationResolution";
import {
  callSignService,
  GMRS_FILE_MISSING,
  lookupCallsign,
  sourceLabels,
  type CallsignSource,
} from "../../callsignLookup";
import { RemoveConfirmBar, RemovedPanel } from "../RemoveControls";
import { useVoidableList } from "../../hooks/useVoidableList";
import LocationPicker from "../LocationPicker";
import { ClipboardCheck, NotebookPen } from "lucide-react";
import SortToggle from "../SortToggle";
import { sortByTime, useSortOrder } from "../../hooks/useSortOrder";
import { NetColumns, NetRow } from "./roster/NetRows";
import { LogColumns, LogRow } from "./roster/LogRows";
import { RangeColumns, RangeEditRow, RangeRow } from "./roster/RangeRows";
import { CheckinEditRow } from "./roster/CheckinEditRow";
import type { Place } from "./roster/shared";
import { isSkywarn } from "../../activityTypes";

interface Props {
  activity: Activity;
  operatorId: string | null;
  /** Goes to the activity's Exports & forms on the Operations tab. */
  onOpenExports: () => void;
  checkins: Checkin[];
  /** A closed activity: entries can be corrected but not added or removed (LIFE-013). */
  readOnly?: boolean;
  qrzConfigured: boolean;
  offlineCallsAvailable: boolean;
  selectedCheckinId: string | null;
  onSelectCheckin: (id: string | null) => void;
  onCheckinsChanged: () => void;
  onShowMap: () => void;
  /** A station log: contacts with radio details instead of check-ins with traffic. */
  log?: boolean;
  /** A range check: reports with a cross street, station type and signal reports (RANGE-020). */
  rangeCheck?: boolean;
  /**
   * Where distances are measured from: the activity's repeater, else net
   * control (the same point the map uses). None, no distances.
   */
  distanceFrom?: Place | null;
  /** A SKYWARN net: each check-in's linked reports' hazards, oldest first (SPOT-024). */
  reportsByCheckin?: Map<string, string[]>;
  /** A SKYWARN net: take a report from this station on the Spotter Reports tab. */
  onReport?: (checkin: Checkin) => void;
}


type QrzStatus = "idle" | "loading" | "found" | "not_found" | "missing_file" | "error";

/** The check-in roster: list, inline edit, remove/restore, and QRZ retry. */
export default function CheckinRoster({
  activity,
  operatorId,
  onOpenExports,
  checkins,
  readOnly = false,
  qrzConfigured,
  offlineCallsAvailable,
  selectedCheckinId,
  onSelectCheckin,
  onCheckinsChanged,
  onShowMap,
  log = false,
  rangeCheck = false,
  distanceFrom = null,
  reportsByCheckin,
  onReport,
}: Props) {
  const skywarn = isSkywarn(activity.activity_type);
  const [editingCheckinId, setEditingCheckinId] = useState<string | null>(null);
  /** Contacts whose details (power, antenna, notes, address…) are expanded. */
  const [openDetails, setOpenDetails] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [order, toggleOrder] = useSortOrder(log ? "contacts" : "checkins", "newest");
  const [checkinLookupStatus, setCheckinLookupStatus] = useState<QrzStatus>("idle");
  const [lookupSource, setLookupSource] = useState<CallsignSource>("qrz");
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const selectedCheckin = checkins.find((c) => c.id === selectedCheckinId) ?? null;
  const selectedIsGmrs = selectedCheckin
    ? callSignService(selectedCheckin.call_sign) === "gmrs"
    : false;

  const removal = useVoidableList<Checkin>({
    scopeKey: activity.id,
    listVoided: () => api.listVoidedCheckins(activity.id),
    voidItem: (id, reason) => api.voidCheckin(id, reason, operatorId),
    restoreItem: (id) => api.restoreCheckin(id, operatorId),
    onChanged: onCheckinsChanged,
    onRemoved: (id) => {
      if (selectedCheckinId === id) onSelectCheckin(null);
    },
  });
  const removingCheckinId = removal.removingId;

  useEffect(() => {
    setEditingCheckinId(null);
    setOpenDetails(new Set());
    setSearch("");
  }, [activity.id]);

  useEffect(() => {
    setCheckinLookupStatus("idle");
  }, [selectedCheckinId]);

  function startEdit(c: Checkin) {
    setEditingCheckinId(c.id);
    removal.cancelRemove();
  }

  const toggleIn = (set: typeof setOpenDetails) => (id: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleDetails = toggleIn(setOpenDetails);

  async function handleTrafficHandled(id: string, handled: boolean) {
    await api.setCheckinTrafficHandled(id, handled, operatorId);
    onCheckinsChanged();
  }

  function cancelEdit() {
    setEditingCheckinId(null);
  }

  function finishEdit() {
    setEditingCheckinId(null);
    onCheckinsChanged();
  }

  // Rapid entry can outrun the debounced, type-as-you-go QRZ lookup (a
  // check-in saved before it resolves, or entered too fast to wait on it).
  // This lets the operator retry it afterward for a specific saved
  // check-in, filling in only whatever fields are still blank so it never
  // clobbers a manual correction (mirrors QRZ-021/026/029's "don't
  // overwrite" rule for the entry form).
  async function handleLookupSelectedCheckin() {
    if (!selectedCheckin) return;
    setCheckinLookupStatus("loading");
    try {
      // GMRS: the GMRS file. Otherwise QRZ first, the amateur file only when
      // QRZ isn't available.
      const outcome = await lookupCallsign(selectedCheckin.call_sign, qrzConfigured);
      if (outcome.kind === "not_found") {
        setLookupSource(outcome.source);
        setCheckinLookupStatus("not_found");
        return;
      }
      if (outcome.kind === "missing_file") {
        setCheckinLookupStatus("missing_file");
        return;
      }
      if (outcome.kind === "unavailable") {
        const err = outcome.error;
        setCheckinLookupStatus(
          err === ERR_OFFLINE || err === QRZ_ERR_NOT_CONFIGURED ? "idle" : "error"
        );
        return;
      }
      setLookupSource(outcome.source);
      const result = outcome.data;
      const qth = selectedCheckin.qth_location.trim() || result.qth_location || null;
      const grid = selectedCheckin.grid_square.trim() || result.grid_square || null;
      const address = selectedCheckin.address.trim() || result.address || null;

      let locationLat = selectedCheckin.location_lat;
      let locationLon = selectedCheckin.location_lon;
      let locationLabel = selectedCheckin.location_label || null;
      // An automatic location is worked out again from what the lookup found,
      // which may be better (QRZ's exact point instead of a ZIP's center). One
      // placed by hand is kept.
      if (locationLat == null || locationLon == null || !selectedCheckin.location_manual) {
        const resolved = await resolveOfflineLocationAsync({
          qrzLat: result.exact_lat,
          qrzLon: result.exact_lon,
          gridSquare: grid,
          address,
          qthLocation: qth,
        });
        if (resolved) {
          locationLat = resolved.lat;
          locationLon = resolved.lon;
          locationLabel = qth || address || resolved.sourceText;
        }
      }

      await api.updateCheckin(
        selectedCheckin.id,
        selectedCheckin.call_sign,
        selectedCheckin.name.trim() || result.name || null,
        qth,
        grid,
        address,
        operatorId,
        locationLat,
        locationLon,
        locationLabel,
        selectedCheckin.has_traffic,
        selectedCheckin.traffic || null
      );
      setCheckinLookupStatus("found");
      onCheckinsChanged();
    } catch (err) {
      setCheckinLookupStatus(
        err === ERR_OFFLINE || err === QRZ_ERR_NOT_CONFIGURED ? "idle" : "error"
      );
    }
  }

  async function handleSaveCheckinLocation(lat: number, lon: number, label: string) {
    if (!selectedCheckin) return;
    setLocationError(null);
    try {
      // A range check's point is labeled with its cross street (RANGE-014).
      const pointLabel = rangeCheck ? selectedCheckin.cross_street : label;
      await api.setCheckinLocationCoords(selectedCheckin.id, lat, lon, pointLabel || null);
      onCheckinsChanged();
      setShowLocationPicker(false);
    } catch (e) {
      setLocationError(String(e));
    }
  }

  async function handleClearCheckinLocation() {
    if (!selectedCheckin) return;
    setLocationError(null);
    try {
      await api.clearCheckinLocation(selectedCheckin.id);
      onCheckinsChanged();
    } catch (e) {
      setLocationError(String(e));
    }
  }

  function startRemove(id: string) {
    removal.startRemove(id);
    setEditingCheckinId(null);
  }

  // A log is searched to answer "who's who": call, name, place, or notes.
  const query = search.trim().toLowerCase();
  const shown = query
    ? checkins.filter((c) =>
        [c.call_sign, c.name, c.qth_location, c.cross_street, c.notes].some((v) =>
          v.toLowerCase().includes(query)
        )
      )
    : checkins;
  const rows = sortByTime(shown, (c) => c.checked_in_at, order);
  const noun = log ? "contacts" : "check-ins";

  return (
    <>
      <div className="checkin-roster-panel">
        <div className="checkin-roster-header">
          <h3>
            {log ? (
              <NotebookPen className="heading-icon" />
            ) : (
              <ClipboardCheck className="heading-icon" />
            )}
            {log ? "Contacts" : "Check-ins"} — {activity.title}
            {activity.frequency && (
              <span className="checkin-roster-frequency"> ({activity.frequency})</span>
            )}
          </h3>
          <div className="checkin-roster-header-actions">
            <span className="checkin-roster-count">
              {log
                ? `${checkins.length} ${checkins.length === 1 ? "contact" : "contacts"}`
                : `${checkins.length} checked in`}
            </span>
            <SortToggle order={order} onToggle={toggleOrder} />
            <button onClick={onShowMap}>Show map</button>
            <button
              className="link-button"
              onClick={onOpenExports}
              title="Export the roster, forms, and more"
            >
              Exports…
            </button>
            <button className="link-button" onClick={removal.toggleShowRemoved}>
              {removal.showRemoved ? "Hide removed" : "Show removed"}
            </button>
          </div>
        </div>
        {(log || rangeCheck) && checkins.length > 0 && (
          <input
            className="checkin-roster-search"
            type="search"
            aria-label={rangeCheck ? "Search check-ins" : "Search contacts"}
            placeholder={
              rangeCheck
                ? "Search by call sign, name, cross street, or notes"
                : "Search by call sign, name, location, or notes"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        {/* Column headings and rows scroll sideways together when the window is
            too narrow for every column, keeping them lined up. */}
        <div
          className={
            "checkin-roster-scroll" +
            (log ? " checkin-roster-scroll-log" : rangeCheck ? " checkin-roster-scroll-range" : "")
          }
        >
          <div className="checkin-roster">
            {rows.length > 0 &&
              (rangeCheck ? (
                <RangeColumns distanceFrom={distanceFrom} />
              ) : log ? (
                <LogColumns distanceFrom={distanceFrom} />
              ) : (
                <NetColumns reports={skywarn} />
              ))}
            {rows.length === 0 && (
              <p className="checkin-empty-state">
                {query
                  ? `No ${noun} match “${search.trim()}”.`
                  : log
                    ? "No contacts logged yet."
                    : "No check-ins recorded yet."}
              </p>
            )}
            {rows.map((c) => {
              const row = {
                checkin: c,
                selected: selectedCheckinId === c.id,
                onSelect: () => onSelectCheckin(c.id),
              };
              if (c.id === editingCheckinId) {
                return rangeCheck ? (
                  <RangeEditRow
                    key={c.id}
                    checkin={c}
                    operatorId={operatorId}
                    repeater={distanceFrom}
                    onSaved={finishEdit}
                    onCancel={cancelEdit}
                  />
                ) : (
                  <CheckinEditRow
                    key={c.id}
                    checkin={c}
                    activity={activity}
                    operatorId={operatorId}
                    log={log}
                    qrzConfigured={qrzConfigured}
                    near={distanceFrom}
                    onSaved={finishEdit}
                    onCancel={cancelEdit}
                  />
                );
              }
              if (rangeCheck) return <RangeRow key={c.id} {...row} distanceFrom={distanceFrom} />;
              if (log)
                return (
                  <LogRow
                    key={c.id}
                    {...row}
                    distanceFrom={distanceFrom}
                    detailsOpen={openDetails.has(c.id)}
                    onToggleDetails={() => toggleDetails(c.id)}
                  />
                );
              return (
                <NetRow
                  key={c.id}
                  {...row}
                  onTrafficHandled={(handled) => handleTrafficHandled(c.id, handled)}
                  reports={skywarn ? (reportsByCheckin?.get(c.id) ?? []) : undefined}
                  onReport={skywarn && !readOnly && onReport ? () => onReport(c) : undefined}
                />
              );
            })}
          </div>
        </div>

        {selectedCheckin &&
          removingCheckinId !== selectedCheckin.id &&
          !editingCheckinId && (
            <div className="inline-form checkin-roster-actions">
              <button onClick={() => startEdit(selectedCheckin)}>Edit</button>
              <button onClick={() => setShowLocationPicker(true)}>
                {selectedCheckin.location_lat != null ? "Edit location" : "Set location"}
              </button>
              {!readOnly && <button onClick={() => startRemove(selectedCheckin.id)}>Remove</button>}
              {(qrzConfigured || offlineCallsAvailable || selectedIsGmrs) && (
                <button
                  onClick={handleLookupSelectedCheckin}
                  disabled={checkinLookupStatus === "loading"}
                >
                  {checkinLookupStatus === "loading"
                    ? "Looking up…"
                    : sourceLabels(selectedIsGmrs ? "gmrs" : qrzConfigured ? "qrz" : "fcc").button}
                </button>
              )}
              {checkinLookupStatus === "found" && (
                <span className="qrz-status qrz-status-found">
                  {sourceLabels(lookupSource).updated}
                </span>
              )}
              {checkinLookupStatus === "not_found" && (
                <span className="qrz-status qrz-status-muted">
                  {sourceLabels(lookupSource).notFound.replace(/^./, (c) => c.toUpperCase())}
                </span>
              )}
              {checkinLookupStatus === "missing_file" && (
                <span className="qrz-status qrz-status-muted">{GMRS_FILE_MISSING}</span>
              )}
              {checkinLookupStatus === "error" && (
                <span className="qrz-status qrz-status-muted">QRZ lookup failed</span>
              )}
              <button onClick={() => onSelectCheckin(null)}>Clear selection</button>
            </div>
          )}

        {locationError && <p className="weather-area-error">{locationError}</p>}

        {removingCheckinId && (
          <RemoveConfirmBar
            question="Remove this check-in?"
            reason={removal.reason}
            onReasonChange={removal.setReason}
            onConfirm={removal.confirmRemove}
            onCancel={removal.cancelRemove}
          />
        )}
      </div>

      {removal.showRemoved && (
        <RemovedPanel
          title="Removed check-ins"
          emptyText="No removed check-ins."
          items={removal.voided}
          renderItem={(c) => (
            <>
              <span className="checkin-row-call">{c.call_sign}</span>
              <span className="checkin-row-name">{c.name || ""}</span>
            </>
          )}
          onRestore={removal.restore}
        />
      )}

      {showLocationPicker && selectedCheckin && (
        <LocationPicker
          title={`Location — ${selectedCheckin.call_sign}`}
          initialLat={selectedCheckin.location_lat}
          initialLon={selectedCheckin.location_lon}
          initialLabel={selectedCheckin.location_label}
          onSave={handleSaveCheckinLocation}
          onClear={
            // A range-check point can be moved, never cleared (RANGE-017).
            !rangeCheck && selectedCheckin.location_lat != null
              ? handleClearCheckinLocation
              : undefined
          }
          onClose={() => setShowLocationPicker(false)}
          mapOnly={rangeCheck}
          startAt={rangeCheck ? distanceFrom : null}
        />
      )}
    </>
  );
}
