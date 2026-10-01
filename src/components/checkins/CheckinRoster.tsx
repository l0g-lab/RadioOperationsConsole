import { Fragment, useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, Checkin } from "../../types";
import { QRZ_ERR_NOT_CONFIGURED, ERR_OFFLINE } from "../../types";
import { formatTimeLines } from "../../utils";
import { formatCoords } from "../../geo";
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
import { ClipboardCheck } from "lucide-react";

interface Props {
  activity: Activity;
  operatorId: string | null;
  /** Goes to the Exports tab. */
  onOpenExports: () => void;
  checkins: Checkin[];
  /** True for a closed activity: the roster is shown but can't be changed. */
  readOnly?: boolean;
  qrzConfigured: boolean;
  offlineCallsAvailable: boolean;
  selectedCheckinId: string | null;
  onSelectCheckin: (id: string | null) => void;
  onCheckinsChanged: () => void;
  onShowMap: () => void;
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
}: Props) {
  const [editingCheckinId, setEditingCheckinId] = useState<string | null>(null);
  const [editCallSign, setEditCallSign] = useState("");
  const [editName, setEditName] = useState("");
  const [editQthLocation, setEditQthLocation] = useState("");
  const [editGridSquare, setEditGridSquare] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editHasTraffic, setEditHasTraffic] = useState(false);
  const [editTraffic, setEditTraffic] = useState("");
  const [openTraffic, setOpenTraffic] = useState<Set<string>>(new Set());
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
    setOpenTraffic(new Set());
  }, [activity.id]);

  useEffect(() => {
    setCheckinLookupStatus("idle");
  }, [selectedCheckinId]);

  function startEdit(c: Checkin) {
    setEditingCheckinId(c.id);
    setEditCallSign(c.call_sign);
    setEditName(c.name);
    setEditQthLocation(c.qth_location);
    setEditGridSquare(c.grid_square);
    setEditAddress(c.address);
    setEditHasTraffic(c.has_traffic);
    setEditTraffic(c.traffic);
    removal.cancelRemove();
  }

  function toggleTraffic(id: string) {
    setOpenTraffic((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function handleTrafficHandled(id: string, handled: boolean) {
    await api.setCheckinTrafficHandled(id, handled, operatorId);
    onCheckinsChanged();
  }

  function cancelEdit() {
    setEditingCheckinId(null);
  }

  async function saveEdit() {
    if (!editingCheckinId) return;
    const call = editCallSign.trim();
    if (!call) return;
    const trimmedQth = editQthLocation.trim() || null;
    const trimmedGrid = editGridSquare.trim() || null;
    const trimmedAddress = editAddress.trim() || null;

    // A location already on the check-in — auto-resolved earlier or set by
    // hand via "Edit location" — is left as-is; only resolve fresh when
    // there's nothing there yet, so editing a typo in the address later
    // never silently discards a manual pin (mirrors the QRZ auto-fill
    // fields below: never overwrite something already set).
    const current = checkins.find((c) => c.id === editingCheckinId);
    let locationLat = current?.location_lat ?? null;
    let locationLon = current?.location_lon ?? null;
    let locationLabel = current?.location_label || null;
    if (locationLat == null || locationLon == null) {
      const resolved = await resolveOfflineLocationAsync({
        gridSquare: trimmedGrid,
        address: trimmedAddress,
        qthLocation: trimmedQth,
      });
      if (resolved) {
        locationLat = resolved.lat;
        locationLon = resolved.lon;
        locationLabel = trimmedQth || trimmedAddress || resolved.sourceText;
      }
    }

    await api.updateCheckin(
      editingCheckinId,
      call,
      editName.trim() || null,
      trimmedQth,
      trimmedGrid,
      trimmedAddress,
      operatorId,
      locationLat,
      locationLon,
      locationLabel,
      editHasTraffic,
      editHasTraffic ? editTraffic.trim() || null : null
    );
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
      if (locationLat == null || locationLon == null) {
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
      await api.setCheckinLocationCoords(selectedCheckin.id, lat, lon, label || null);
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

  const rosterNewestFirst = [...checkins].reverse();

  return (
    <>
      <div className="checkin-roster-panel">
        <div className="checkin-roster-header">
          <h3>
            <ClipboardCheck className="heading-icon" />
            Check-ins — {activity.title}
            {activity.frequency && (
              <span className="checkin-roster-frequency"> ({activity.frequency})</span>
            )}
          </h3>
          <div className="checkin-roster-header-actions">
            <span className="checkin-roster-count">{checkins.length} checked in</span>
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
        {rosterNewestFirst.length > 0 && (
          <div className="checkin-row checkin-row-columns">
            <span>Call Sign</span>
            <span>Name</span>
            <span>Location</span>
            <span>Grid Square</span>
            <span>Coordinates</span>
            <span>Address</span>
            <span className="checkin-row-time">Time</span>
            <span>Traffic</span>
          </div>
        )}
        <div className="checkin-roster">
          {rosterNewestFirst.length === 0 && (
            <p className="checkin-empty-state">No check-ins recorded yet.</p>
          )}
          {rosterNewestFirst.map((c) =>
            c.id === editingCheckinId ? (
              <div key={c.id} className="checkin-row checkin-row-editing">
                <input
                  autoFocus
                  className="checkin-edit-call"
                  value={editCallSign}
                  onChange={(e) => setEditCallSign(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                />
                <input
                  className="checkin-edit-name"
                  placeholder="Name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                />
                <input
                  className="checkin-edit-qth"
                  placeholder="QTH location"
                  value={editQthLocation}
                  onChange={(e) => setEditQthLocation(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                />
                <input
                  className="checkin-edit-grid"
                  placeholder="Grid"
                  value={editGridSquare}
                  onChange={(e) => setEditGridSquare(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                />
                <input
                  className="checkin-edit-address"
                  placeholder="Full address"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                />
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={editHasTraffic}
                    onChange={(e) => setEditHasTraffic(e.target.checked)}
                  />
                  Has traffic
                </label>
                {editHasTraffic && (
                  <input
                    className="checkin-edit-traffic"
                    placeholder="Traffic"
                    value={editTraffic}
                    onChange={(e) => setEditTraffic(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                )}
                <div className="checkin-edit-actions">
                  <button onClick={saveEdit}>Save</button>
                  <button onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            ) : (
              (() => {
                const t = formatTimeLines(c.checked_in_at);
                const trafficOpen = c.has_traffic && openTraffic.has(c.id);
                return (
                  <Fragment key={c.id}>
                    <div
                      className={"checkin-row" + (selectedCheckinId === c.id ? " selected" : "")}
                      onClick={() => onSelectCheckin(c.id)}
                    >
                      <span className="checkin-row-call">{c.call_sign}</span>
                      <span className="checkin-row-name">{c.name || ""}</span>
                      <span className="checkin-row-location">{c.qth_location}</span>
                      <span className="checkin-row-grid">{c.grid_square}</span>
                      <span className="checkin-row-coords" title={c.location_label || undefined}>
                        {c.location_lat != null && c.location_lon != null
                          ? formatCoords(c.location_lat, c.location_lon)
                          : ""}
                      </span>
                      <span className="checkin-row-address" title={c.address || undefined}>
                        {c.address}
                      </span>
                      <span className="checkin-row-time">
                        <span>{t.local}</span>
                        <span>{t.utc}</span>
                      </span>
                      <span className="checkin-row-traffic">
                        {c.has_traffic && (
                          <button
                            className="link-button"
                            aria-expanded={trafficOpen}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTraffic(c.id);
                            }}
                          >
                            {trafficOpen ? "Hide traffic" : "Show traffic"}
                          </button>
                        )}
                      </span>
                    </div>
                    {trafficOpen && (
                      <div className="report-notes-detail">
                        <span className="report-notes-label">Traffic:</span>{" "}
                        {c.traffic || <em>No details recorded yet.</em>}
                        <label className="checkbox-row traffic-handled">
                          <input
                            type="checkbox"
                            checked={c.traffic_handled}
                            disabled={readOnly}
                            onChange={(e) => handleTrafficHandled(c.id, e.target.checked)}
                          />
                          Handled
                        </label>
                      </div>
                    )}
                  </Fragment>
                );
              })()
            )
          )}
        </div>

        {!readOnly &&
          selectedCheckin &&
          removingCheckinId !== selectedCheckin.id &&
          !editingCheckinId && (
            <div className="inline-form checkin-roster-actions">
              <button onClick={() => startEdit(selectedCheckin)}>Edit</button>
              <button onClick={() => setShowLocationPicker(true)}>
                {selectedCheckin.location_lat != null ? "Edit location" : "Set location"}
              </button>
              <button onClick={() => startRemove(selectedCheckin.id)}>Remove</button>
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
              <button
                onClick={() =>
                  api.createAuditEvent(
                    "checkin",
                    selectedCheckin.id,
                    "create_report_from_checkin",
                    null,
                    operatorId
                  )
                }
              >
                Create linked report
              </button>
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
          onClear={selectedCheckin.location_lat != null ? handleClearCheckinLocation : undefined}
          onClose={() => setShowLocationPicker(false)}
        />
      )}
    </>
  );
}
