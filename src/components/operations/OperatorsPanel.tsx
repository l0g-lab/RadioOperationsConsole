import { useEffect, useState } from "react";
import * as api from "../../api";
import { lookupCallsign } from "../../callsignLookup";
import type { Operator } from "../../types";
import LocationPicker from "../LocationPicker";
import { resolveOfflineLocationAsync } from "../../locationResolution";
import { Users } from "lucide-react";

interface Props {
  operators: Operator[];
  /** The current operator, recorded as who retired or restored someone. */
  selectedOperatorId: string | null;
  onOperatorsChanged: () => void;
  onSelectOperator: (id: string | null) => void;
}

export default function OperatorsPanel({
  operators,
  selectedOperatorId,
  onOperatorsChanged,
  onSelectOperator,
}: Props) {
  const hasOperators = operators.length > 0;
  // Collapsed by default once operators exist, so the roster isn't crowded
  // out by a form most visits don't need — but open for a brand-new setup.
  const [collapsed, setCollapsed] = useState(true);
  const showAddForm = hasOperators ? !collapsed : true;
  const [operatorName, setOperatorName] = useState("");
  const [operatorCallSign, setOperatorCallSign] = useState("");
  const [operatorLookingUp, setOperatorLookingUp] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationEditOperator, setLocationEditOperator] = useState<Operator | null>(null);
  // Removing: an operator nothing names is deleted; one with records can only
  // be retired, so history keeps who did what (AUDIT-012, AUDIT-013).
  const [removing, setRemoving] = useState<{ operator: Operator; hasRecords: boolean } | null>(
    null
  );
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [retired, setRetired] = useState<Operator[]>([]);
  const [showRetired, setShowRetired] = useState(false);

  useEffect(() => {
    api
      .listRetiredOperators()
      .then(setRetired)
      .catch(() => setRetired([]));
  }, [operators]);

  async function startRemove(o: Operator) {
    setRemoveError(null);
    try {
      setRemoving({ operator: o, hasRecords: await api.operatorHasRecords(o.id) });
    } catch (e) {
      setRemoveError(String(e));
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    try {
      if (removing.hasRecords) await api.retireOperator(removing.operator.id, selectedOperatorId);
      else await api.deleteOperator(removing.operator.id);
      setRemoving(null);
      onOperatorsChanged();
    } catch (e) {
      setRemoveError(String(e));
    }
  }

  async function handleRestore(o: Operator) {
    setRemoveError(null);
    try {
      await api.restoreOperator(o.id, selectedOperatorId);
      onOperatorsChanged();
    } catch (e) {
      setRemoveError(String(e));
    }
  }

  async function handleAddOperator() {
    if (!operatorName.trim()) return;
    const callSign = operatorCallSign.trim();
    const id = await api.createOperator(operatorName.trim(), callSign || null);
    onOperatorsChanged();
    onSelectOperator(id);
    setOperatorName("");
    setOperatorCallSign("");
    setCollapsed(true);

    if (!callSign) return;
    // Best-effort: use QRZ to seed the new operator's default location from
    // their call sign, the same directory data used for check-in lookups.
    // A missing/unconfigured/offline QRZ connector is expected and silent
    // (QRZ-030) — the operator can still set a location by hand afterward.
    setOperatorLookingUp(true);
    try {
      // QRZ first; the offline FCC directory only when QRZ isn't available.
      const settings = await api.getSettings().catch(() => null);
      const qrzConfigured = Boolean(settings?.qrz_username && settings?.qrz_password);
      const outcome = await lookupCallsign(callSign, qrzConfigured);
      if (outcome.kind !== "found") return;
      const result = outcome.data;
      const grid = result.grid_square?.trim() || null;
      const address = result.address?.trim() || null;
      const qth = result.qth_location?.trim() || null;
      const label = qth || address || "";

      // Offline first (ZIP centroid, then grid square — see
      // locationResolution.ts), online geocoding only as a fallback when
      // neither offline method has anything to work with.
      const offline = await resolveOfflineLocationAsync({
        qrzLat: result.exact_lat,
        qrzLon: result.exact_lon,
        gridSquare: grid,
        address,
        qthLocation: qth,
      });
      if (offline) {
        await api.setOperatorLocationCoords(id, offline.lat, offline.lon, label || offline.sourceText);
        onOperatorsChanged();
      } else {
        const query = address || qth;
        if (query) {
          const geo = await api.geocodeLocation(query);
          if (geo) {
            await api.setOperatorLocationCoords(id, geo.lat, geo.lon, geo.display_name || query);
            onOperatorsChanged();
          }
        }
      }
    } catch {
      // Offline, not configured, or no match — leave location unset.
    } finally {
      setOperatorLookingUp(false);
    }
  }

  async function handleClearOperatorLocation(operatorId: string) {
    setLocationError(null);
    try {
      await api.setOperatorLocation(operatorId, "");
      onOperatorsChanged();
    } catch (e) {
      setLocationError(String(e));
    }
  }

  async function handleSaveOperatorPin(operatorId: string, lat: number, lon: number, label: string) {
    setLocationError(null);
    try {
      await api.setOperatorLocationCoords(operatorId, lat, lon, label || null);
      onOperatorsChanged();
      setLocationEditOperator(null);
    } catch (e) {
      setLocationError(String(e));
    }
  }

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h3><Users className="heading-icon" />Operators</h3>
        {hasOperators && (
          <button className="link-button" onClick={() => setCollapsed((c) => !c)}>
            {showAddForm ? "Hide" : "+ Add operator"}
          </button>
        )}
      </div>
      <div className="operator-list">
        {operators.length === 0 && <p className="checkin-empty-state">No operators yet.</p>}
        {operators.map((o) => (
          <div key={o.id} className="operator-row">
            <span>
              {o.display_name}
              {o.location_label && ` — ${o.location_label}`}
              {o.call_sign && ` — ${o.call_sign}`}
            </span>
            <span className="operator-row-actions">
              <button className="link-button" onClick={() => setLocationEditOperator(o)}>
                Edit location
              </button>
              <button
                className="link-button danger-link"
                aria-label={`Remove ${o.display_name}`}
                onClick={() => startRemove(o)}
              >
                Remove
              </button>
            </span>
          </div>
        ))}
      </div>
      {removing && (
        <div className="confirm-row">
          {removing.hasRecords ? (
            <p>
              {removing.operator.display_name} is named on check-ins, reports, or history, so they
              can't be deleted without losing who did what. Retire them instead? They'll be hidden
              from operator lists, and history keeps their name. You can restore them later.
            </p>
          ) : (
            <p>
              Delete {removing.operator.display_name} permanently? They haven't been recorded on
              anything, so nothing else changes. This cannot be undone.
            </p>
          )}
          <div className="inline-form">
            {removing.hasRecords ? (
              <button onClick={confirmRemove}>Retire</button>
            ) : (
              <button className="danger" onClick={confirmRemove}>
                Delete permanently
              </button>
            )}
            <button onClick={() => setRemoving(null)}>Cancel</button>
          </div>
        </div>
      )}
      {removeError && <p className="weather-area-error">{removeError}</p>}
      {locationError && <p className="weather-area-error">{locationError}</p>}
      {retired.length > 0 && (
        <>
          <button className="link-button" onClick={() => setShowRetired((v) => !v)}>
            {showRetired ? "Hide retired" : `Show retired (${retired.length})`}
          </button>
          {showRetired &&
            retired.map((o) => (
              <div key={o.id} className="operator-row">
                <span className="settings-hint">
                  {o.display_name}
                  {o.call_sign && ` — ${o.call_sign}`}
                </span>
                <button
                  className="link-button"
                  aria-label={`Restore ${o.display_name}`}
                  onClick={() => handleRestore(o)}
                >
                  Restore
                </button>
              </div>
            ))}
        </>
      )}

      {showAddForm && (
        <>
          <div className="inline-form">
            <input
              autoFocus={hasOperators}
              placeholder="Display name"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddOperator();
                if (e.key === "Escape" && hasOperators) setCollapsed(true);
              }}
            />
            <input
              placeholder="Call sign"
              value={operatorCallSign}
              onChange={(e) => setOperatorCallSign(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddOperator();
              }}
            />
            <button onClick={handleAddOperator} disabled={operatorLookingUp}>
              {operatorLookingUp ? "Adding…" : "Add operator"}
            </button>
          </div>
          <p className="settings-hint">
            When a call sign is given, QRZ is used to look up a default location automatically, if
            configured in Settings. Use "Edit location" to override it.
          </p>
        </>
      )}

      {locationEditOperator && (
        <LocationPicker
          title={`Location — ${locationEditOperator.display_name}`}
          initialLat={locationEditOperator.location_lat}
          initialLon={locationEditOperator.location_lon}
          initialLabel={locationEditOperator.location_label}
          onSave={(lat, lon, label) => handleSaveOperatorPin(locationEditOperator.id, lat, lon, label)}
          onClear={
            locationEditOperator.location_lat != null
              ? () => handleClearOperatorLocation(locationEditOperator.id)
              : undefined
          }
          onClose={() => setLocationEditOperator(null)}
        />
      )}
    </div>
  );
}
