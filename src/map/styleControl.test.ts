import { afterEach, describe, expect, it, vi } from "vitest";
import L from "leaflet";
import { addBasemapWithStyleControl, getMapStyle } from "./styleControl";

function setup() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const map = L.map(el).setView([25.76, -80.5], 10);
  addBasemapWithStyleControl(map);
  const buttons = el.querySelectorAll<HTMLButtonElement>(".map-style-button");
  /** The style whose button shows as chosen. */
  const chosen = () => [...buttons].find((b) => b.getAttribute("aria-pressed") === "true")?.textContent;
  const pick = (label: string) => [...buttons].find((b) => b.textContent === label)!.click();
  return { el, map, buttons, chosen, pick };
}

const tileLayers = (map: L.Map) => {
  const found: L.TileLayer[] = [];
  map.eachLayer((l) => {
    if (l instanceof L.TileLayer) found.push(l);
  });
  return found;
};

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("map style picker", () => {
  it("starts on the street map", () => {
    const { map, buttons, chosen } = setup();
    expect([...buttons].map((b) => b.textContent)).toEqual(["Street", "Dark", "Satellite"]);
    expect(chosen()).toBe("Street");
    const [layer] = tileLayers(map);
    expect(tileLayers(map)).toHaveLength(1);
    expect((layer as unknown as { _url: string })._url).toContain("tile.openstreetmap.org");
    expect(layer.getContainer()!.classList.contains("basemap-dark")).toBe(false);
  });

  it("swaps the tiles for each style, one basemap at a time", () => {
    const { map, chosen, pick } = setup();

    pick("Satellite");
    expect(chosen()).toBe("Satellite");
    expect(tileLayers(map)).toHaveLength(1);
    expect((tileLayers(map)[0] as unknown as { _url: string })._url).toContain("basemap.nationalmap.gov");

    pick("Dark");
    expect(chosen()).toBe("Dark");
    expect(tileLayers(map)).toHaveLength(1);
    const [dark] = tileLayers(map);
    expect((dark as unknown as { _url: string })._url).toContain("tile.openstreetmap.org");
    expect(dark.getContainer()!.classList.contains("basemap-dark")).toBe(true);
  });

  it("is remembered for the next map, and followed by maps already open", () => {
    const first = setup();
    const second = setup();
    first.pick("Satellite");

    expect(getMapStyle()).toBe("satellite");
    expect(second.chosen()).toBe("Satellite");
    expect((tileLayers(second.map)[0] as unknown as { _url: string })._url).toContain("nationalmap");

    const third = setup();
    expect(third.chosen()).toBe("Satellite");
  });

  it("doesn't count as a click on the map", () => {
    const { map, pick } = setup();
    const onMap = vi.fn();
    map.on("click", onMap);
    pick("Dark");
    expect(onMap).not.toHaveBeenCalled();
  });

  it("stops following once its map is closed", () => {
    const first = setup();
    const second = setup();
    second.map.remove();
    const touched = vi.spyOn(second.map, "removeLayer");
    first.pick("Dark");
    expect(touched).not.toHaveBeenCalled();
  });
});
