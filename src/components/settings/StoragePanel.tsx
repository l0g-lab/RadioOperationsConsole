import { useCallback, useEffect, useState } from "react";
import * as api from "../../api";
import { clearTileCache, tileCacheUsage } from "../../offlineTileLayer";
import type { StorageItem, StorageItemId } from "../../types";
import { ArchiveRestore, BookUser, Download, Map as MapIcon, MapPin, Milestone, type LucideIcon } from "lucide-react";

type RowId = StorageItemId | "map-tiles";

interface RowDef {
  id: RowId;
  label: string;
  /** Plural noun for the count ("tiles", "files"). */
  unit: [string, string];
  about: string;
  /** What clearing means for offline use, shown before confirming (STORE-003). */
  consequence: string;
  icon: LucideIcon;
}

const ROWS: RowDef[] = [
  {
    id: "map-tiles",
    icon: MapIcon,
    label: "Map tiles",
    unit: ["tile", "tiles"],
    about: "Saved as you view maps, so those areas work offline.",
    consequence: "Map areas will be blank offline until you view them again while online.",
  },
  {
    id: "callsigns-amateur",
    icon: BookUser,
    label: "Amateur call-sign file",
    unit: ["file", "files"],
    about: "The FCC amateur licenses, for lookups when QRZ isn't available.",
    consequence: "Offline amateur lookups stop until you download the file again (about 200 MB).",
  },
  {
    id: "callsigns-gmrs",
    icon: BookUser,
    label: "GMRS call-sign file",
    unit: ["file", "files"],
    about: "The FCC GMRS licenses, for GMRS call-sign lookups.",
    consequence: "GMRS lookups stop until you download the file again (about 55 MB).",
  },
  {
    id: "road-data",
    icon: Milestone,
    label: "Road updates",
    unit: ["road", "roads"],
    about: "Mile-marker roads you've updated from the Florida DOT.",
    consequence: "Mile-marker lookup goes back to the copy built into the app, which may be older.",
  },
  {
    id: "looked-up-places",
    icon: MapPin,
    label: "Looked-up places",
    unit: ["file", "files"],
    about:
      "Addresses, towns and cross streets already found online, so each is looked up once and the next check-in from the same place is placed at once.",
    consequence: "Places will be looked up online again as they're entered.",
  },
  {
    id: "partial-downloads",
    icon: Download,
    label: "Unfinished downloads",
    unit: ["file", "files"],
    about: "Kept so an interrupted call-sign download can resume.",
    consequence: "An interrupted download will start over instead of resuming.",
  },
  {
    id: "restore-copies",
    icon: ArchiveRestore,
    label: "Safety copies",
    unit: ["copy", "copies"],
    about:
      "Your data as it was just before each restore or app update, in case something went wrong.",
    consequence: "A past restore or update can no longer be undone from these copies.",
  },
];

function formatSize(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

type Usage = { files: number; bytes: number };

/**
 * What the application keeps on this computer besides its records, with sizes
 * and a way to clear each (STORE-001–STORE-003), as rows of the Offline data
 * panel; the call-sign files have their own rows there. Map tiles live in the
 * webview's cache and are measured here; the rest comes from the backend.
 * Rows with nothing stored are left out, except map tiles. The footer gives
 * the total of everything, call-sign files included.
 */
export default function StoragePanel({
  onCleared,
  only,
}: {
  onCleared: () => void;
  /** The rows to show; all of them if not given. */
  only?: RowId[];
}) {
  const [usage, setUsage] = useState<Partial<Record<RowId, Usage | null>>>({});
  /** The folder each item is kept in, so people can find it on disk. */
  const [locations, setLocations] = useState<Partial<Record<RowId, string>>>({});
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<RowId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyItems = (items: StorageItem[]) => {
    setUsage((u) => ({
      ...u,
      ...Object.fromEntries(items.map((i) => [i.id, { files: i.files, bytes: i.bytes }])),
    }));
    setLocations((l) => ({ ...l, ...Object.fromEntries(items.map((i) => [i.id, i.location])) }));
  };

  const measure = useCallback(async () => {
    setLoading(true);
    const [items, tiles] = await Promise.all([
      api.storageUsage().catch((e) => {
        setError(String(e));
        return [] as StorageItem[];
      }),
      tileCacheUsage().catch(() => null),
    ]);
    applyItems(items);
    setUsage((u) => ({ ...u, "map-tiles": tiles && { files: tiles.tiles, bytes: tiles.bytes } }));
    setLoading(false);
  }, []);

  useEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    api
      .tileCacheLocation()
      .then((dir) => setLocations((l) => ({ ...l, "map-tiles": dir })))
      .catch(() => {});
  }, []);

  async function clear(id: RowId) {
    setBusy(true);
    setError(null);
    try {
      if (id === "map-tiles") {
        await clearTileCache();
        const tiles = await tileCacheUsage();
        setUsage((u) => ({
          ...u,
          "map-tiles": tiles && { files: tiles.tiles, bytes: tiles.bytes },
        }));
      } else {
        applyItems(await api.clearStorage(id));
      }
      setConfirming(null);
      onCleared();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const total = Object.values(usage).reduce((sum, u) => sum + (u?.bytes ?? 0), 0);

  const rows = ROWS.filter((r) => !only || only.includes(r.id));

  return (
    <>
      {rows.map((row) => {
        const u = usage[row.id];
        const empty = !u || u.files === 0;
        if (empty && row.id !== "map-tiles" && u !== undefined) return null;
        return (
          <div key={row.id} className="offline-pack-row" role="group" aria-label={row.label}>
            <div className="offline-pack-info">
              <row.icon className="offline-row-icon" aria-hidden />
              <strong>{row.label}</strong>{" "}
              <span className="settings-hint">
                {u === undefined
                  ? "Measuring…"
                  : u === null
                    ? "Not available"
                    : empty
                      ? "Nothing stored"
                      : `${u.files.toLocaleString()} ${u.files === 1 ? row.unit[0] : row.unit[1]} · ${formatSize(u.bytes)}`}
              </span>
              <div className="settings-hint" title={locations[row.id] ? `Kept in ${locations[row.id]}` : undefined}>
                {row.about}
              </div>
              {confirming === row.id && (
                <div className="confirm-row">
                  <p>
                    Clear {row.label.toLowerCase()}? {row.consequence}
                  </p>
                  <div className="inline-form">
                    <button className="danger" onClick={() => clear(row.id)} disabled={busy}>
                      Clear {row.label.toLowerCase()}
                    </button>
                    <button onClick={() => setConfirming(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            {!empty && confirming !== row.id && (
              <button
                onClick={() => {
                  setError(null);
                  setConfirming(row.id);
                }}
                aria-label={`Clear ${row.label.toLowerCase()}…`}
              >
                Clear…
              </button>
            )}
          </div>
        );
      })}
      {error && <p className="weather-area-error">{error}</p>}
      <p className="settings-hint storage-total">
        {loading ? "Measuring…" : `All offline data on this computer: ${formatSize(total)}`}{" "}
        <button className="link-button" onClick={measure} disabled={loading}>
          Refresh
        </button>
      </p>
    </>
  );
}
