import { useEffect, useState } from "react";
import * as api from "../../api";
import { lookupCallsign } from "../../callsignLookup";
import type { Operator, OperatorUsage } from "../../types";
import LocationPicker from "../LocationPicker";
import { resolveOfflineLocationAsync } from "../../locationResolution";
import { MapPin, Pencil, Star, UserMinus, Users } from "lucide-react";

interface Props {
  operators: Operator[];
  /** The current operator, recorded as who retired or restored someone. */
  selectedOperatorId: string | null;
  onOperatorsChanged: () => void;
  /** Makes an operator the default (`selectedOperatorId`). */
  onSetDefault: (id: string) => void;
  /** Opens an activity the operator is named in, to change it. */
  onSelectActivity?: (id: string) => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Where history entries outside an activity were made. */
const HISTORY_PLACES: Record<string, string> = {
  repeater: "the repeater directory",
  place: "saved places",
  net_listing: "net listings",
  operator: "other operators",
  ics214_log: "ICS 214 activity logs",
};

/** What they did in one activity, e.g. "net control · 14 check-ins · 3 history entries". */
function activityUse(a: OperatorUsage["activities"][number]): string {
  return [
    a.runs ? "its operator (net control)" : "",
    a.checkins ? plural(a.checkins, "check-in", "check-ins") : "",
    a.spotter_reports ? plural(a.spotter_reports, "spotter report", "spotter reports") : "",
    a.relay ? plural(a.relay, "relay entry", "relay entries") : "",
    a.history ? plural(a.history, "history entry", "history entries") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function OperatorsPanel({
  operators,
  selectedOperatorId,
  onOperatorsChanged,
  onSetDefault,
  onSelectActivity,
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
  const [removing, setRemoving] = useState<{
    operator: Operator;
    usage: OperatorUsage;
    hasRecords: boolean;
  } | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  // Correcting a name or call sign, in place in the list.
  const [editing, setEditing] = useState<{ id: string; name: string; call: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  async function saveEdit() {
    if (!editing) return;
    try {
      await api.updateOperator(editing.id, editing.name, editing.call.trim() || null, selectedOperatorId);
      setEditing(null);
      setEditError(null);
      onOperatorsChanged();
    } catch (e) {
      setEditError(String(e));
    }
  }
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
      const usage = await api.operatorUsage(o.id);
      setRemoving({
        operator: o,
        usage,
        hasRecords: usage.activities.length > 0 || usage.other_history.length > 0,
      });
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
    // The first operator added is the default.
    if (operators.length === 0) onSetDefault(id);
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
        {operators.map((o) =>
          editing?.id === o.id ? (
            <div
              key={o.id}
              className="operator-row operator-edit"
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") setEditing(null);
              }}
            >
              <div className="inline-form">
                <input
                  autoFocus
                  aria-label="Display name"
                  placeholder="Display name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
                <input
                  aria-label="Call sign"
                  placeholder="Call sign"
                  value={editing.call}
                  onChange={(e) => setEditing({ ...editing, call: e.target.value })}
                />
                <button className="primary" onClick={saveEdit}>
                  Save
                </button>
                <button onClick={() => setEditing(null)}>Cancel</button>
              </div>
              {editError && <p className="weather-area-error">{editError}</p>}
              <p className="settings-hint">
                The correction shows everywhere they're named, including past nets. If they also
                log under a second call sign (say, GMRS as well as ham), add that as another
                operator instead.
              </p>
            </div>
          ) : (
          <div key={o.id} className="operator-row">
            <span className="operator-row-name" title={o.location_label ? `Location: ${o.location_label}` : undefined}>
              {o.display_name}
              {o.call_sign && ` — ${o.call_sign}`}
              {operators.length > 1 && o.id === selectedOperatorId && (
                <span
                  className="type-pill operator-default"
                  title="New activities are run by this operator unless you choose another"
                >
                  Default
                </span>
              )}
            </span>
            <span className="operator-row-actions operator-row-icons">
              {operators.length > 1 && o.id !== selectedOperatorId && (
                <button
                  className="icon-button"
                  aria-label={`Make ${o.display_name} the default`}
                  onClick={() => onSetDefault(o.id)}
                  title="Make default: new activities are run by this operator unless you choose another"
                >
                  <Star />
                </button>
              )}
              <button
                className="icon-button"
                aria-label={`Edit ${o.display_name}`}
                title="Edit name or call sign"
                onClick={() => {
                  setEditing({ id: o.id, name: o.display_name, call: o.call_sign });
                  setEditError(null);
                }}
              >
                <Pencil />
              </button>
              <button
                className="icon-button"
                aria-label={`Edit location of ${o.display_name}`}
                title={o.location_label ? `Edit location (${o.location_label})` : "Set location"}
                onClick={() => setLocationEditOperator(o)}
              >
                <MapPin />
              </button>
              <button
                className="icon-button danger-link"
                aria-label={`Remove ${o.display_name}`}
                title="Remove"
                onClick={() => startRemove(o)}
              >
                <UserMinus />
              </button>
            </span>
          </div>
          )
        )}
      </div>
      {removing && (
        <div className="confirm-row">
          {removing.hasRecords ? (
            <>
              <p>
                {removing.operator.display_name}
                {removing.operator.call_sign && ` (${removing.operator.call_sign})`} is named here, so
                they can't be deleted without losing who did what:
              </p>
              <ul className="operator-usage">
                {removing.usage.activities.map((a) => (
                  <li key={a.id}>
                    {onSelectActivity ? (
                      <button className="link-button" onClick={() => onSelectActivity(a.id)}>
                        {a.title}
                      </button>
                    ) : (
                      <strong>{a.title}</strong>
                    )}{" "}
                    <span className="settings-hint">— {activityUse(a)}</span>
                  </li>
                ))}
                {removing.usage.other_history.map((h) => (
                  <li key={h.kind}>
                    {plural(h.count, "change", "changes")} in {HISTORY_PLACES[h.kind] ?? h.kind.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
              <p className="settings-hint">
                {removing.usage.activities.length > 0 &&
                  "To move an activity to another operator, open it and change Operator in its Edit form. "}
                Or retire them: they'll be hidden from operator lists, and history keeps their name.
                You can restore them later.
              </p>
            </>
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
