import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  resolveMileMarker: vi.fn(),
  geocodeLocation: vi.fn(),
}));
vi.mock("./locationResolution", () => ({
  // ZIP 32817's centre, for any text with that ZIP in it.
  resolveOfflineLocationAsync: vi.fn(async (i: { address: string | null }) =>
    i.address?.includes("32817") ? { lat: 28.59, lon: -81.24, source: "zip_centroid", sourceText: "32817" } : null
  ),
}));

import * as api from "./api";
import { asGridSquare, resolveCheckinLocation } from "./checkinLocation";

describe("the check-in Location box (CIMAP-080)", () => {
  beforeEach(() => {
    vi.mocked(api.resolveMileMarker).mockResolvedValue(null);
    vi.mocked(api.geocodeLocation).mockResolvedValue(null);
  });

  it("recognises a grid square typed on its own", () => {
    expect(asGridSquare("el98hm")).toBe("EL98hm");
    expect(asGridSquare("EL98")).toBe("EL98");
    expect(asGridSquare("Orlando")).toBeNull();
  });

  it("keeps a lookup's town, grid and exact point, and its address in the box", async () => {
    const lookup = { text: "123 Main St, Orlando FL 32817", qth: "Orlando, FL", grid: "EL98", exact: { lat: 28.6, lon: -81.2 } };
    const r = await resolveCheckinLocation(lookup.text, { lookup });
    expect(r).toMatchObject({ address: lookup.text, qth: "Orlando, FL", grid: "EL98", lat: 28.6, placedBy: "qrz", manual: false });
  });

  it("places typed coordinates and mile markers exactly, by hand, with a grid worked out", async () => {
    const coords = await resolveCheckinLocation("28.5383, -81.3792");
    expect(coords).toMatchObject({ placedBy: "coords", manual: true, address: null, grid: "EL98hm" });

    vi.mocked(api.resolveMileMarker).mockResolvedValue({ lat: 28.2, lon: -81.1, label: "Turnpike MM 182" } as never);
    const mile = await resolveCheckinLocation("MM 182 turnpike");
    expect(mile).toMatchObject({ placedBy: "mile_marker", manual: true, label: "Turnpike MM 182", address: "MM 182 turnpike" });
  });

  it("a pin on the map wins over everything typed", async () => {
    const r = await resolveCheckinLocation("28.5, -81.3", { pin: { lat: 28.7, lon: -81.5, label: "Field site" } });
    expect(r).toMatchObject({ lat: 28.7, placedBy: "pin", manual: true, label: "Field site" });
  });

  it("looks a cross street up online only when connected, else uses a ZIP's centre", async () => {
    vi.mocked(api.geocodeLocation).mockResolvedValue({ lat: 28.55, lon: -81.21, display_name: null });
    const offline = await resolveCheckinLocation("Colonial Dr & Alafaya Tr 32817");
    expect(offline).toMatchObject({ placedBy: "zip", approx: true });
    expect(api.geocodeLocation).not.toHaveBeenCalled();

    const online = await resolveCheckinLocation("Colonial Dr & Alafaya Tr 32817", { online: true });
    expect(online).toMatchObject({ placedBy: "online", lat: 28.55, approx: false, manual: false });
  });

  it("says when it can't be placed", async () => {
    const r = await resolveCheckinLocation("Behind the fire station");
    expect(r.lat).toBeNull();
    expect(r.address).toBe("Behind the fire station");
    expect(r.note).toMatch(/pick it on the map/);
  });
});
