import L from "leaflet";
import { isWorkingOffline } from "./workOffline";

// Basemap tiles cached via the standard Cache Storage API (CIMAP-050/053):
// a tile fetched once is available again later with no network at all,
// and — unlike an in-memory cache — survives an application restart since
// it's the webview's own persistent cache storage, not page-lifetime state.
const CACHE_NAME = "roc-map-tiles-v1";

type TileImg = HTMLImageElement & { _objectUrl?: string };

function cachingSupported(): boolean {
  return typeof caches !== "undefined";
}

/**
 * How many map tiles are cached and their total size (STORE-002), or null
 * when the webview has no cache storage. Uses each response's
 * Content-Length, reading the body only when that header is missing.
 */
export async function tileCacheUsage(): Promise<{ tiles: number; bytes: number } | null> {
  if (!cachingSupported()) return null;
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  let bytes = 0;
  for (const req of requests) {
    const res = await cache.match(req);
    if (!res) continue;
    const length = Number(res.headers.get("content-length"));
    bytes += Number.isFinite(length) && length > 0 ? length : (await res.blob()).size;
  }
  return { tiles: requests.length, bytes };
}

/** Deletes every cached map tile (STORE-003). */
export async function clearTileCache(): Promise<void> {
  if (!cachingSupported()) return;
  await caches.delete(CACHE_NAME);
}

/**
 * Resolves a tile URL to something an <img> can display: the cached blob
 * as an object URL when available, otherwise a live fetch that also
 * populates the cache for next time. Returns null when the tile is
 * neither cached nor reachable (offline, first visit to that area) —
 * callers leave the tile blank rather than erroring (CIMAP-052).
 */
export async function resolveTileSrc(url: string): Promise<string | null> {
  if (!cachingSupported()) {
    // Without a cache the only source is the network, which working offline rules out.
    return isWorkingOffline() ? null : url;
  }
  try {
    const cache = await caches.open(CACHE_NAME);
    let response = await cache.match(url);
    // Working offline (UX-022): cached tiles only, no fetch.
    if (!response && !isWorkingOffline()) {
      const netResponse = await fetch(url);
      if (netResponse.ok) {
        await cache.put(url, netResponse.clone());
        response = netResponse;
      }
    }
    if (!response) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    // Cache Storage unavailable or fetch failed offline — degrade to
    // "no tile" rather than throwing (CIMAP-051/052).
    return null;
  }
}

/**
 * A Leaflet tile layer that caches tiles as they load (CIMAP-050) and
 * degrades to a blank tile, rather than an error, when a tile is neither
 * cached nor reachable (CIMAP-052).
 */
const CachingTileLayer = L.TileLayer.extend({
  createTile(
    this: L.TileLayer,
    coords: L.Coords,
    done: (error: Error | undefined, tile: HTMLElement) => void
  ) {
    const tile = document.createElement("img") as TileImg;
    const url = this.getTileUrl(coords);

    resolveTileSrc(url)
      .then((src) => {
        if (!src) {
          done(new Error("tile unavailable offline"), tile);
          return;
        }
        if (src.startsWith("blob:")) tile._objectUrl = src;
        tile.onload = () => done(undefined, tile);
        tile.onerror = () => done(new Error("tile failed to decode"), tile);
        tile.src = src;
      })
      .catch(() => done(new Error("tile unavailable offline"), tile));

    return tile;
  },
});

/**
 * Object URLs are cheap but not free; release each tile's URL once
 * Leaflet unloads it (panned out of view, layer removed), rather than
 * leaking one per tile for the life of the map.
 */
export function cachingTileLayer(url: string, options?: L.TileLayerOptions): L.TileLayer {
  const layer: L.TileLayer = new (
    CachingTileLayer as unknown as new (url: string, options?: L.TileLayerOptions) => L.TileLayer
  )(url, options);
  layer.on("tileunload", (e: L.TileEvent) => {
    const tile = e.tile as TileImg;
    if (tile._objectUrl) {
      URL.revokeObjectURL(tile._objectUrl);
      tile._objectUrl = undefined;
    }
  });
  return layer;
}
