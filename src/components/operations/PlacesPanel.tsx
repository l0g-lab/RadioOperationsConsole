import { useCallback, useEffect, useState } from "react";
import * as api from "../../api";
import type { Place, PlaceDetails } from "../../types";
import { formatCoords } from "../../geo";
import LocationPicker from "../LocationPicker";
import { MapPinHouse, Pencil, Trash2 } from "lucide-react";

/** Adding or editing a place: name, where it is, and notes. */
function PlaceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Partial<PlaceDetails>;
  onSave: (d: PlaceDetails) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(
    initial.lat != null && initial.lon != null ? { lat: initial.lat, lon: initial.lon } : null
  );
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setError("Give the place a name.");
    if (!point) return setError("Set where it is on the map.");
    try {
      await onSave({ name: name.trim(), lat: point.lat, lon: point.lon, notes: notes.trim() });
    } catch (e) {
      setError(String(e));
    }
  }

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") onCancel();
  };
  return (
    <div className="repeater-form">
      <input
        autoFocus
        aria-label="Place name"
        placeholder="Name, e.g. Home, Club HQ, Bob's QTH"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={keys}
      />
      <div className="inline-form">
        <span className="settings-hint">
          Location: {point ? formatCoords(point.lat, point.lon) : "not set"}
        </span>
        <button type="button" onClick={() => setPicking(true)}>
          {point ? "Move" : "Set location"}
        </button>
      </div>
      <input
        aria-label="Notes"
        placeholder="Notes (e.g. generator on site, 2 m vertical on the tower)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={keys}
      />
      {error && <p className="weather-area-error">{error}</p>}
      <div className="inline-form">
        <button onClick={save}>Save place</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
      {picking && (
        <LocationPicker
          title={`Location — ${name.trim() || "new place"}`}
          initialLat={point?.lat ?? null}
          initialLon={point?.lon ?? null}
          initialLabel={name}
          onSave={(lat, lon, label) => {
            setPoint({ lat, lon });
            if (!name.trim() && label) setName(label);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/**
 * Saved places net control often operates from (saved-places.md), picked in
 * any map location picker. Deleting one changes nothing else: activities keep
 * their own copy of a location.
 */
export default function PlacesPanel({ selectedOperatorId }: { selectedOperatorId: string | null }) {
  const [places, setPlaces] = useState<Place[]>([]);
  // null: not editing; "new": adding; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Place | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api
      .listPlaces()
      .then(setPlaces)
      .catch(() => setPlaces([]));
  }, []);
  useEffect(refresh, [refresh]);

  async function save(id: string | null, d: PlaceDetails) {
    await api.savePlace(id, d, selectedOperatorId);
    setEditing(null);
    refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setError(null);
    try {
      await api.deletePlace(deleting.id, selectedOperatorId);
      setDeleting(null);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h3>
          <MapPinHouse className="heading-icon" />
          Places
        </h3>
        {editing !== "new" && (
          <button className="link-button" onClick={() => setEditing("new")}>
            + Add place
          </button>
        )}
      </div>
      {editing === "new" && (
        <PlaceForm initial={{}} onSave={(d) => save(null, d)} onCancel={() => setEditing(null)} />
      )}
      <div className="operator-list repeater-list">
        {places.length === 0 && editing !== "new" && (
          <p className="checkin-empty-state">
            No places yet. Save the spots you often operate from — home, a friend's QTH, the club —
            to pick them in any map instead of finding them again.
          </p>
        )}
        {places.map((p) =>
          editing === p.id ? (
            <PlaceForm key={p.id} initial={p} onSave={(d) => save(p.id, d)} onCancel={() => setEditing(null)} />
          ) : (
            <div key={p.id} className="operator-row repeater-row">
              {/* One line each: notes are in the tooltip. */}
              <span className="repeater-row-text" title={p.notes || undefined}>
                <strong className="repeater-row-name">{p.name}</strong>
                <span className="checkin-row-mono repeater-row-detail">{formatCoords(p.lat, p.lon)}</span>
              </span>
              <span className="operator-row-actions repeater-row-actions">
                <button
                  className="icon-button"
                  aria-label={`Edit ${p.name}`}
                  title="Edit"
                  onClick={() => setEditing(p.id)}
                >
                  <Pencil />
                </button>
                <button
                  className="icon-button danger-link"
                  aria-label={`Delete ${p.name}`}
                  title="Delete"
                  onClick={() => setDeleting(p)}
                >
                  <Trash2 />
                </button>
              </span>
            </div>
          )
        )}
      </div>
      {deleting && (
        <div className="confirm-row">
          <p>
            Delete “{deleting.name}” from your places? Activities whose location was set from it keep
            their location.
          </p>
          <div className="inline-form">
            <button className="danger" onClick={confirmDelete}>
              Delete
            </button>
            <button onClick={() => setDeleting(null)}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="weather-area-error">{error}</p>}
    </div>
  );
}
