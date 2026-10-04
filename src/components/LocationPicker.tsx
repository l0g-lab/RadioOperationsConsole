import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { EXPAND_EVENT } from "../map/expandControl";
import * as api from "../api";
import { ERR_OFFLINE, type Place } from "../types";
import { formatAxis, getCoordFormat, parseAxis, type CoordFormat } from "../geo";
import { DEFAULT_CENTER, DEFAULT_ZOOM, createBaseMap } from "../map/baseMap";
import { MapPin } from "lucide-react";

interface Props {
  title: string;
  initialLat: number | null;
  initialLon: number | null;
  initialLabel: string;
  onSave: (lat: number, lon: number, label: string) => void;
  onClear?: () => void;
  onClose: () => void;
  /**
   * The point may only be set by clicking the map: no typed coordinates or
   * label, and a search only moves the map (RANGE-014). The label passed to
   * `onSave` is then always empty; the caller supplies its own.
   */
  mapOnly?: boolean;
  /** Where the map opens when there's no point yet (e.g. the repeater). */
  startAt?: { lat: number; lon: number } | null;
  /** Shown under the search instead of the usual how-to. */
  hint?: string;
}

const PIN_ZOOM = 12;
const PLACEHOLDER: Record<CoordFormat, { lat: string; lon: string }> = {
  dd: { lat: "e.g. 39.73915", lon: "e.g. -104.9903" },
  ddm: { lat: "e.g. 39°44.349′N", lon: "e.g. 104°59.418′W" },
  dms: { lat: "e.g. 39°44′20.9″N", lon: "e.g. 104°59′25.1″W" },
};

const PIN_COLOR = "#2b8cff";
const PIN_STROKE = "#0a3d7a";

/**
 * Lets an operator pin an exact location three ways — click/drag on a map,
 * type GPS coordinates directly, or search free text (zip/city/address) —
 * for sites too new or precise to resolve from a text search alone
 * (CIMAP-073). Shared between operator and per-activity location entry.
 */
export default function LocationPicker({
  title,
  initialLat,
  initialLon,
  initialLabel,
  onSave,
  onClear,
  onClose,
  mapOnly = false,
  startAt = null,
  hint,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pinRef = useRef<L.CircleMarker | null>(null);

  const [lat, setLat] = useState<number | null>(initialLat);
  const [lon, setLon] = useState<number | null>(initialLon);
  const [label, setLabel] = useState(initialLabel);
  const [latText, setLatText] = useState(initialLat != null ? formatAxis(initialLat, "lat") : "");
  const [lonText, setLonText] = useState(initialLon != null ? formatAxis(initialLon, "lon") : "");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Saved places (PLACE-020): picked to drop the pin, or the pin saved as one.
  const [places, setPlaces] = useState<Place[]>([]);
  const [naming, setNaming] = useState<string | null>(null);
  const [placeMessage, setPlaceMessage] = useState<string | null>(null);
  useEffect(() => {
    if (mapOnly) return;
    api
      .listPlaces()
      .then(setPlaces)
      .catch(() => setPlaces([]));
  }, [mapOnly]);

  function pickPlace(id: string) {
    const p = places.find((x) => x.id === id);
    if (!p) return;
    placePin(p.lat, p.lon, true);
    setLabel(p.name);
    setNote(p.notes || null);
    setError(null);
  }

  async function saveAsPlace() {
    const name = (naming ?? "").trim();
    if (!name || lat == null || lon == null) return;
    try {
      await api.savePlace(null, { name, lat, lon, notes: "" }, null);
      setPlaces(await api.listPlaces());
      setNaming(null);
      setPlaceMessage(`Saved “${name}” to your places.`);
    } catch (e) {
      setPlaceMessage(String(e));
    }
  }

  // The map's click handler is registered once at mount, so anything it
  // reads has to come through a ref to see current values, not the first
  // render's.
  const latest = useRef({ lat, lon });
  latest.current = { lat, lon };

  function placePin(newLat: number, newLon: number, pan: boolean) {
    // The label describes the previous point, so it goes stale the moment
    // the pin moves somewhere else. (Re-committing the same coordinates —
    // e.g. tabbing through the fields — isn't a move, so it's kept; search
    // sets its own label right after placing the pin.)
    const prev = latest.current;
    const moved =
      prev.lat == null ||
      prev.lon == null ||
      Math.abs(prev.lat - newLat) > 1e-5 ||
      Math.abs(prev.lon - newLon) > 1e-5;
    if (moved) {
      setLabel("");
      setNote(null);
    }
    setLat(newLat);
    setLon(newLon);
    setLatText(formatAxis(newLat, "lat"));
    setLonText(formatAxis(newLon, "lon"));
    const map = mapRef.current;
    if (!map) return;
    if (pinRef.current) {
      pinRef.current.setLatLng([newLat, newLon]);
    } else {
      pinRef.current = L.circleMarker([newLat, newLon], {
        radius: 7,
        color: PIN_STROKE,
        weight: 2,
        fillColor: PIN_COLOR,
        fillOpacity: 0.9,
      }).addTo(map);
    }
    if (pan) map.setView([newLat, newLon], Math.max(map.getZoom(), PIN_ZOOM));
  }

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const startCenter: [number, number] =
      initialLat != null && initialLon != null
        ? [initialLat, initialLon]
        : startAt
          ? [startAt.lat, startAt.lon]
          : DEFAULT_CENTER;
    const startZoom =
      (initialLat != null && initialLon != null) || startAt ? PIN_ZOOM : DEFAULT_ZOOM;
    const map = createBaseMap(mapContainerRef.current, startCenter, startZoom);
    map.on("click", (e: L.LeafletMouseEvent) => {
      placePin(e.latlng.lat, e.latlng.lng, false);
    });
    // Leaving full view: bring the chosen point back into sight.
    map.on(EXPAND_EVENT, (e) => {
      const pin = pinRef.current;
      if (!(e as unknown as { expanded: boolean }).expanded && pin) {
        map.setView(pin.getLatLng(), Math.max(map.getZoom(), PIN_ZOOM));
      }
    });
    mapRef.current = map;
    if (initialLat != null && initialLon != null) {
      pinRef.current = L.circleMarker([initialLat, initialLon], {
        radius: 7,
        color: PIN_STROKE,
        weight: 2,
        fillColor: PIN_COLOR,
        fillOpacity: 0.9,
      }).addTo(map);
    }
    return () => {
      map.remove();
      mapRef.current = null;
      pinRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCoordsCommit() {
    if (!latText.trim() || !lonText.trim()) return;
    const parsedLat = parseAxis(latText, "lat");
    const parsedLon = parseAxis(lonText, "lon");
    if (parsedLat == null || parsedLon == null) {
      setError(
        "Couldn't read those coordinates. Use decimal degrees (39.73915), degrees & decimal " +
          "minutes (39°44.349′N) or degrees/minutes/seconds (39°44′20.9″N); latitude within 90°, longitude within 180°."
      );
      return;
    }
    setError(null);
    placePin(parsedLat, parsedLon, true);
  }

  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setError(null);
    setNote(null);
    // Map-only: a search just takes the map there; the pin is still clicked.
    const goTo = (lat: number, lon: number) => {
      mapRef.current?.setView([lat, lon], Math.max(mapRef.current.getZoom(), 16));
      setNote("Map moved there — now click the exact spot.");
    };
    try {
      // "mile marker 182 on turnpike" and the like resolve locally, from
      // the offline road data — no internet needed — before falling back to
      // the online address/place search.
      const mile = await api.resolveMileMarker(trimmed).catch(() => null);
      if (mile && mapOnly) {
        goTo(mile.lat, mile.lon);
        return;
      }
      if (mile) {
        placePin(mile.lat, mile.lon, true);
        setLabel(mile.label);
        setNote("Estimated from road data — nudge the pin if you know it's off.");
        return;
      }
      const result = await api.geocodeLocation(trimmed);
      if (result && mapOnly) {
        goTo(result.lat, result.lon);
      } else if (result) {
        placePin(result.lat, result.lon, true);
        setLabel(result.display_name || trimmed);
      } else {
        setError("No location found matching that text.");
      }
    } catch (e) {
      setError(
        e === ERR_OFFLINE
          ? "Can't search for that without an internet connection. Try the map or GPS coordinates instead."
          : String(e)
      );
    } finally {
      setSearching(false);
    }
  }

  function handleSave() {
    if (lat == null || lon == null) return;
    onSave(lat, lon, mapOnly ? "" : label.trim());
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel location-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><MapPin className="heading-icon" />{title}</h3>
          <button onClick={onClose}>Close</button>
        </div>

        {places.length > 0 && (
          <div className="location-picker-search">
            <select aria-label="Saved places" value="" onChange={(e) => pickPlace(e.target.value)}>
              <option value="">Saved places…</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="location-picker-search">
          <input
            placeholder="Search by zip, city/state, address, or e.g. mile marker 182 on turnpike"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
          <button onClick={handleSearch} disabled={searching || !query.trim()}>
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        <p className="settings-hint">
          {hint ??
            (mapOnly
              ? "Click the map at the exact spot to drop the pin. Searching only moves the map."
              : "Or click anywhere on the map to drop a pin, or type exact GPS coordinates below.")}
        </p>

        <div ref={mapContainerRef} className="location-picker-map" />

        {mapOnly ? (
          <p className="weather-area-status">
            {lat != null && lon != null ? (
              <>
                Pin: <strong>{formatAxis(lat, "lat")}, {formatAxis(lon, "lon")}</strong>
              </>
            ) : (
              "No pin yet."
            )}
          </p>
        ) : (
          <div className="location-picker-coords">
            <label>
              Latitude
              <input
                value={latText}
                onChange={(e) => setLatText(e.target.value)}
                onBlur={handleCoordsCommit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCoordsCommit();
                }}
                placeholder={PLACEHOLDER[getCoordFormat()].lat}
              />
            </label>
            <label>
              Longitude
              <input
                value={lonText}
                onChange={(e) => setLonText(e.target.value)}
                onBlur={handleCoordsCommit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCoordsCommit();
                }}
                placeholder={PLACEHOLDER[getCoordFormat()].lon}
              />
            </label>
            <label className="location-picker-label-field">
              Label (optional)
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Field site, county EOC"
              />
            </label>
          </div>
        )}

        {note && !error && <p className="settings-hint">{note}</p>}
        {error && <p className="weather-area-error">{error}</p>}

        <div className="location-picker-actions">
          <button onClick={handleSave} disabled={lat == null || lon == null}>
            Save location
          </button>
          {onClear && (
            <button
              onClick={() => {
                onClear();
                onClose();
              }}
            >
              Clear
            </button>
          )}
          <button onClick={onClose}>Cancel</button>
          {!mapOnly && naming == null && (
            <button
              className="link-button"
              disabled={lat == null || lon == null}
              title="Keep this spot in your saved places, to pick it again later"
              onClick={() => {
                setNaming(label);
                setPlaceMessage(null);
              }}
            >
              Save as place
            </button>
          )}
        </div>
        {naming != null && (
          <div className="inline-form">
            <input
              autoFocus
              aria-label="Place name"
              placeholder="Name, e.g. Home, Club HQ"
              value={naming}
              onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveAsPlace();
                if (e.key === "Escape") setNaming(null);
              }}
            />
            <button onClick={saveAsPlace} disabled={!naming.trim()}>
              Save place
            </button>
            <button className="link-button" onClick={() => setNaming(null)}>
              Cancel
            </button>
          </div>
        )}
        {placeMessage && <p className="settings-hint">{placeMessage}</p>}
      </div>
    </div>
  );
}
