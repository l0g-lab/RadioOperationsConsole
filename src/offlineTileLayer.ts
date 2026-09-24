import L from "leaflet";

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
 * Resolves a tile URL to something an <img> can display: the cached blob
 * as an object URL when available, otherwise a live fetch that also
 * populates the cache for next time. Returns null when the tile is
 * neither cached nor reachable (offline, first visit to that area) —
 * callers leave the tile blank rather than erroring (CIMAP-052).
 */
async function resolveTileSrc(url: string): Promise<string | null> {
  if (!cachingSupported()) {
    return url;
  }
  try {
    const cache = await caches.open(CACHE_NAME);
    let response = await cache.match(url);
    if (!response) {
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
