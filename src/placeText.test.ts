import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  resolveMileMarker: vi.fn(),
  listPlaces: vi.fn(),
  recallPlace: vi.fn(),
  geocodeLocation: vi.fn(),
}));
vi.mock("./locationResolution", () => ({
  resolveOfflineLocationAsync: vi.fn(async (i: { address: string | null; gridSquare: string | null }) =>
    i.address?.includes("33177")
      ? { lat: 25.6, lon: -80.4, source: "zip_centroid", sourceText: "33177" }
      : i.gridSquare
        ? { lat: 25.5, lon: -80.5, source: "grid_square", sourceText: i.gridSquare }
        : null
  ),
}));

import * as api from "./api";
import { placeText, savedPlaceNamed } from "./placeText";
import { initWorkOffline } from "./workOffline";
import type { FoundPlace, Place } from "./types";

const eoc: Place = { id: "p1", name: "County EOC", lat: 25.77, lon: -80.19, notes: "" } as Place;
const corner: FoundPlace = { lat: 25.626, lon: -80.414, precision: "crossing", label: "x", source: "nominatim" };
const near = { lat: 25.62, lon: -80.41 };

describe("placeText — the one place resolver (LOCRES-060)", () => {
  beforeEach(() => {
    vi.mocked(api.resolveMileMarker).mockResolvedValue(null);
    vi.mocked(api.listPlaces).mockResolvedValue([eoc]);
    vi.mocked(api.recallPlace).mockResolvedValue(null);
    vi.mocked(api.geocodeLocation).mockReset().mockResolvedValue(null);
    initWorkOffline(false);
  });

  it("places coordinates in any format, and a grid square's centre, without asking anyone", async () => {
    const dms = await placeText(`25°37′34″N 80°24′52″W`, { online: "wait" });
    expect(dms).toMatchObject({ source: "coords", manual: true, approx: false, lookUp: false });
    expect(dms.lat).toBeCloseTo(25.6261, 3);
    expect(await placeText("EL95tp", { online: "later" })).toMatchObject({ source: "grid", approx: true, lookUp: false });
    expect(api.geocodeLocation).not.toHaveBeenCalled();
    expect(api.recallPlace).not.toHaveBeenCalled();
  });

  it("finds a saved place typed by name, ignoring case", async () => {
    const p = await placeText("county eoc", { online: "wait" });
    expect(p).toMatchObject({ source: "saved_place", lat: 25.77, label: "County EOC", manual: true });
    expect(savedPlaceNamed([eoc], " COUNTY EOC ")).toBe(eoc);
    expect(savedPlaceNamed([eoc], "EOC")).toBeNull();
    expect(api.geocodeLocation).not.toHaveBeenCalled();
  });

  it("remembers what was looked up before, even offline, near the same net", async () => {
    vi.mocked(api.recallPlace).mockResolvedValue(corner);
    initWorkOffline(true);
    const p = await placeText("sw 152 st & sw 137 ave", { near, online: "later" });
    expect(p).toMatchObject({ source: "remembered", lat: 25.626, approx: false, lookUp: false });
    expect(api.recallPlace).toHaveBeenCalledWith("sw 152 st & sw 137 ave", near);
  });

  it("waits for the online search in a search box, and says when it's only roughly placed", async () => {
    vi.mocked(api.geocodeLocation).mockResolvedValue({ ...corner, precision: "town", lat: 28.6 });
    const p = await placeText("Winter Park", { near, online: "wait" });
    expect(p).toMatchObject({ source: "online", lat: 28.6, approx: true, lookUp: false });
    expect(p.label).toBe("Winter Park (the town's centre — approximate)");
    expect(api.geocodeLocation).toHaveBeenCalledWith("Winter Park", near);
  });

  it("doesn't wait when saving: a ZIP's centre now, looked up online after", async () => {
    const p = await placeText("13700 sw 152 st miami fl 33177", { near, online: "later" });
    expect(p).toMatchObject({ source: "zip", approx: true, lookUp: true });
    expect(p.note).toMatch(/looked up exactly online once saved/);
    expect(api.geocodeLocation).not.toHaveBeenCalled();
  });

  it("uses a call-sign lookup's exact point, else its grid square", async () => {
    const exact = { qth: "Miami, FL", grid: "EL95", exact: { lat: 25.7, lon: -80.3 } };
    expect(await placeText("Miami, FL", { station: exact, online: "later" })).toMatchObject({ source: "qrz", lat: 25.7 });
    const rough = await placeText("Miami, FL", { station: { ...exact, exact: null }, online: "later" });
    expect(rough).toMatchObject({ source: "station_grid", approx: true, lookUp: true });
  });

  it("says what to do when it can't be placed", async () => {
    initWorkOffline(true);
    expect((await placeText("Behind the fire station", { online: "wait" })).note).toBe(
      "can't be placed offline — pick it on the map"
    );
    initWorkOffline(false);
    expect((await placeText("Behind the fire station", { online: "wait" })).note).toMatch(/^not found/);
    expect((await placeText("", { online: "later" })).lookUp).toBe(false);
  });
});
