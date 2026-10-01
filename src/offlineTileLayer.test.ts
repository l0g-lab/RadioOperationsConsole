import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkOffline } from "./workOffline";
import { resolveTileSrc } from "./offlineTileLayer";

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
