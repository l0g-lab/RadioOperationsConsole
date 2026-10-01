import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkOffline } from "./workOffline";
import { clearTileCache, resolveTileSrc, tileCacheUsage } from "./offlineTileLayer";

vi.mock("./api", () => ({ setWorkOffline: vi.fn() }));

describe("map tiles while working offline (UX-022)", () => {
  afterEach(() => {
    initWorkOffline(false);
    vi.unstubAllGlobals();
  });

  it("uses only cached tiles and never fetches", async () => {
    const fetchSpy = vi.fn();
    const match = vi.fn(() => Promise.resolve(undefined));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("caches", { open: () => Promise.resolve({ match, put: vi.fn() }) });
    initWorkOffline(true);

    expect(await resolveTileSrc("https://tile.example/1/2/3.png")).toBeNull();
    expect(match).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("doesn't fall back to a live tile URL when the cache is unavailable", async () => {
    vi.stubGlobal("caches", undefined);
    initWorkOffline(true);
    expect(await resolveTileSrc("https://tile.example/1/2/3.png")).toBeNull();
  });
});

describe("tile cache size and clearing (STORE-001–STORE-003)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubCache(entries: { url: string; length: string | null; blobSize: number }[]) {
    const del = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal("caches", {
      open: () =>
        Promise.resolve({
          keys: () => Promise.resolve(entries.map((e) => new Request(e.url))),
          match: (req: Request) => {
            const e = entries.find((x) => x.url === req.url)!;
            return Promise.resolve({
              headers: new Headers(e.length ? { "content-length": e.length } : {}),
              blob: () => Promise.resolve({ size: e.blobSize }),
            });
          },
        }),
      delete: del,
    });
    return del;
  }

  it("counts tiles and adds up their size", async () => {
    stubCache([
      { url: "https://t/1.png", length: "1000", blobSize: 999 },
      { url: "https://t/2.png", length: null, blobSize: 250 },
    ]);
    expect(await tileCacheUsage()).toEqual({ tiles: 2, bytes: 1250 });
  });

  it("clears by deleting the cache", async () => {
    const del = stubCache([]);
    await clearTileCache();
    expect(del).toHaveBeenCalledWith("roc-map-tiles-v1");
  });

  it("reports nothing measurable when the cache isn't available", async () => {
    vi.stubGlobal("caches", undefined);
    expect(await tileCacheUsage()).toBeNull();
  });
});
