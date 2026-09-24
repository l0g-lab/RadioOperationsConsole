import { useState } from "react";
import * as api from "../../api";
import { lookupCallsign } from "../../callsignLookup";
import type { Operator } from "../../types";
import LocationPicker from "../LocationPicker";
import { resolveOfflineLocationAsync } from "../../locationResolution";

interface Props {
  operators: Operator[];
  onOperatorsChanged: () => void;
  onSelectOperator: (id: string | null) => void;
}

export default function OperatorsPanel({ operators, onOperatorsChanged, onSelectOperator }: Props) {
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
        <h3>Operators</h3>
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
            <button className="link-button" onClick={() => setLocationEditOperator(o)}>
              Edit location
            </button>
          </div>
        ))}
      </div>
      {locationError && <p className="weather-area-error">{locationError}</p>}

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
