import { afterEach, describe, expect, it, vi } from "vitest";
import type { Polygon } from "geojson";
import * as api from "../../api";
import { alertColor, type NwsAlert } from "../../nwsAlerts";
import {
  alertsPopupContent,
  containsPoint,
  latestWarningsTime,
  latestWarningsTimeUrl,
  parseWarnings,
  shapesToDraw,
  vtecEnd,
  warningsInViewUrl,
  withNwsText,
} from "./radarAlerts";

const NOW = new Date("2026-10-10T02:15:00Z");

/** A closed square ring, `r` degrees each way from (lon, lat). */
const square = (lon: number, lat: number, r: number) => [
  [lon - r, lat - r],
  [lon + r, lat - r],
  [lon + r, lat + r],
  [lon - r, lat + r],
  [lon - r, lat - r],
];
// A square around (30, -86) with a small hole in its middle.
const ring: Polygon = { type: "Polygon", coordinates: [square(-86, 30, 1), square(-86, 30, 0.1)] };

const feature = (prod_type: string, cap_id: string, vtec: string | null, geometry: Polygon | null = ring) => ({
  type: "Feature",
  geometry,
  properties: { prod_type, cap_id, vtec },
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NOAA's warnings in view (RADAR-018)", () => {
  it("asks for NOAA's newest refresh time alone", () => {
    const url = new URL(latestWarningsTimeUrl());
    expect(url.origin + url.pathname).toBe("https://opengeo.ncep.noaa.gov/geoserver/wwa/ows");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      request: "GetFeature",
      typeNames: "wwa:warnings",
      propertyName: "IDP_FileDate",
      sortBy: "IDP_FileDate D",
      count: "1",
    });
    expect(latestWarningsTime({ features: [{ properties: { IDP_FileDate: "2026-10-10T02:46:30Z" } }] })).toBe(
      "2026-10-10T02:46:30Z"
    );
    expect(latestWarningsTime({ features: [] })).toBeNull();
    expect(latestWarningsTime({ features: [{ properties: { IDP_FileDate: "x' OR 1=1" } }] })).toBeNull();
  });

  it("asks for the shapes in the view at that refresh only", () => {
    const url = new URL(warningsInViewUrl([-88.5, 28.5, -83.5, 32.5], "2026-10-10T02:46:30Z"));
    expect(url.searchParams.get("cql_filter")).toBe(
      "BBOX(geom,-88.5000,28.5000,-83.5000,32.5000,'EPSG:4326') AND IDP_FileDate = 2026-10-10T02:46:30Z"
    );
    expect(url.searchParams.get("propertyName")).toBe("geom,prod_type,cap_id,vtec");
    expect(url.searchParams.get("srsName")).toBe("EPSG:4326");
  });

  it("keeps each warning once, with its shape, and drops ended ones", () => {
    const list = parseWarnings(
      {
        features: [
          feature("Flash Flood Warning", "urn:oid:ff", "/O.NEW.KTAE.FF.W.0045.261009T2327Z-261010T0530Z/"),
          feature("Flash Flood Warning", "urn:oid:ff", "/O.NEW.KTAE.FF.W.0045.261009T2327Z-261010T0530Z/"),
          feature("Special Marine Warning", "urn:oid:ma", "/O.NEW.KTAE.MA.W.0458.261010T0049Z-261010T0145Z/"),
          feature("Tornado Warning", "urn:oid:no-shape", null, null),
        ],
      },
      NOW
    );
    expect(list).toEqual([
      {
        id: "urn:oid:ff",
        event: "Flash Flood Warning",
        ends: "2026-10-10T05:30:00Z",
        geometry: ring,
        parameters: { VTEC: ["/O.NEW.KTAE.FF.W.0045.261009T2327Z-261010T0530Z/"] },
      },
    ]);
    expect(parseWarnings(null)).toEqual([]);
  });
});

describe("vtecEnd", () => {
  it("reads the end from the VTEC code, as UTC, or null when it's open", () => {
    expect(vtecEnd("/O.NEW.KTAE.FF.W.0045.261009T2327Z-261010T0530Z/")).toBe("2026-10-10T05:30:00Z");
    expect(vtecEnd("/O.CON.KTAE.HU.W.1009.000000T0000Z-000000T0000Z/")).toBeNull();
    expect(vtecEnd(null)).toBeNull();
  });
});

describe("shapesToDraw", () => {
  const vtec = (s: string) => ({ VTEC: [s] });
  it("draws the list's own outlined alerts, then NOAA's that aren't among them", () => {
    const mine: NwsAlert[] = [
      { id: "urn:oid:ff-new", event: "Flash Flood Warning", geometry: ring, parameters: vtec("/O.CON.KMOB.FF.W.0049.261010T0019Z-261010T0615Z/") },
      { id: "urn:oid:hu", event: "Hurricane Warning", geometry: null },
    ];
    const noaa: NwsAlert[] = [
      // An update behind the list: the same event.
      { id: "urn:oid:ff-old", event: "Flash Flood Warning", geometry: ring, parameters: vtec("/O.NEW.KMOB.FF.W.0049.261010T0019Z-261010T0615Z/") },
      { id: "urn:oid:to", event: "Tornado Warning", geometry: ring, parameters: vtec("/O.NEW.KMOB.TO.W.0001.261010T0019Z-261010T0615Z/") },
    ];
    expect(shapesToDraw(mine, noaa).map((a) => a.id)).toEqual(["urn:oid:ff-new", "urn:oid:to"]);
  });
});

describe("containsPoint", () => {
  it("is inside the outline but not in a hole, in any part", () => {
    expect(containsPoint(ring, 30.5, -86)).toBe(true);
    expect(containsPoint(ring, 30, -86)).toBe(false);
    expect(containsPoint(ring, 32, -86)).toBe(false);
    const multi = { type: "MultiPolygon" as const, coordinates: [[square(-80, 25, 1)], ring.coordinates] };
    expect(containsPoint(multi, 25, -80)).toBe(true);
    expect(containsPoint(null, 25, -80)).toBe(false);
  });
});

describe("withNwsText (RADAR-019)", () => {
  it("shows the clicked alerts at once, then with NWS's text for NOAA's", async () => {
    const mine: NwsAlert = { id: "urn:oid:ff", event: "Flash Flood Warning", headline: "Flash Flood Warning until 05:30" };
    const theirs: NwsAlert = { id: "urn:oid:to", event: "Tornado Warning", ends: "2026-10-10T03:00:00Z", geometry: ring };
    const fetchOne = vi.spyOn(api, "fetchNwsAlert").mockResolvedValue({
      properties: { id: "urn:oid:to", event: "Tornado Warning", headline: "Tornado Warning until 23:00", areaDesc: "Walton, FL" },
      geometry: null,
    });
    const updates: [(string | undefined)[], boolean][] = [];
    let last: NwsAlert[] = [];
    await withNwsText([mine, theirs], (list, checking) => {
      updates.push([list.map((a) => a.headline), checking]);
      last = list;
    });
    expect(updates).toEqual([
      [["Flash Flood Warning until 05:30", undefined], true],
      [["Flash Flood Warning until 05:30", "Tornado Warning until 23:00"], false],
    ]);
    expect(fetchOne).toHaveBeenCalledOnce();
    expect(last[1].geometry).toBe(ring);
    expect(last[1].areaDesc).toBe("Walton, FL");
  });

  it("still names a warning NWS's text couldn't be had for, and asks nothing for the list's own", async () => {
    const theirs: NwsAlert = { id: "urn:oid:to", event: "Tornado Warning" };
    vi.spyOn(api, "fetchNwsAlert").mockRejectedValue("offline");
    let last: NwsAlert[] = [];
    await withNwsText([theirs], (list) => (last = list));
    expect(last).toEqual([theirs]);

    const fetchOne = vi.spyOn(api, "fetchNwsAlert");
    fetchOne.mockClear();
    await withNwsText([{ id: "urn:oid:ff", event: "Flash Flood Warning", description: "Rain." }], () => {});
    expect(fetchOne).not.toHaveBeenCalled();
  });
});

describe("alertsPopupContent", () => {
  it("shows each alert with its color, most serious first, and NWS's text behind a click", () => {
    const el = alertsPopupContent(
      [
        { event: "Flood Watch", areaDesc: "Escambia, FL; Santa Rosa, FL" },
        { event: "Flash Flood Warning", headline: "Flash Flood Warning until 05:30", description: "At 9 PM, heavy rain.\n\nFlooding is ongoing." },
      ],
      false
    );
    const items = [...el.querySelectorAll(".radar-alert-here")];
    expect(items.map((i) => i.querySelector("strong")?.textContent)).toEqual(["Flash Flood Warning", "Flood Watch"]);
    expect((items[0].querySelector(".alert-swatch") as HTMLElement).style.borderColor).not.toBe("");
    expect(items[0].querySelectorAll("details p")).toHaveLength(2);
    expect(items[1].querySelector(".radar-alert-here-area")?.textContent).toBe("Escambia, Santa Rosa");
    expect(el.querySelector(".settings-hint")).toBeNull();
    expect(alertsPopupContent([], true).textContent).toContain("Getting NWS's text");
  });
});

describe("alertColor", () => {
  it("matches radar.weather.gov for storm warnings, and has a fallback", () => {
    expect(alertColor("Tornado Warning")).toBe("#FF0000");
    expect(alertColor("Flash Flood Warning")).toBe("#397939");
    expect(alertColor("Hurricane Warning")).toBe("#DC143C");
    expect(alertColor("Something New")).toBe("#A0A0A0");
  });
});
