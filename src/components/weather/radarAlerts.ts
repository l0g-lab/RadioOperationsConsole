/**
 * The alerts drawn on the radar as shapes you can click (RADAR-018, RADAR-019):
 * the area's own alerts with an outline, and every storm warning NOAA has in
 * view — each once, in its NWS color — and the popup that says what's going
 * on in the ones clicked.
 */
import type { Geometry, Position } from "geojson";
import * as api from "../../api";
import { alertColor, alertFromFeature, alertLevel, areaText, paragraphs, sortAlerts, untilText, type NwsAlert } from "../../nwsAlerts";

const WWA_WFS = "https://opengeo.ncep.noaa.gov/geoserver/wwa/ows";

function wfsUrl(params: Record<string, string>): string {
  return `${WWA_WFS}?${new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: "wwa:warnings",
    outputFormat: "application/json",
    ...params,
  })}`;
}

/**
 * When NOAA last refreshed its storm warnings: the newest record's time. NOAA
 * keeps every refresh (every couple of minutes) side by side, so the shapes
 * are asked for at this one, as radar.weather.gov does.
 */
export const latestWarningsTimeUrl = (): string =>
  wfsUrl({ propertyName: "IDP_FileDate", sortBy: "IDP_FileDate D", count: "1" });

export function latestWarningsTime(json: unknown): string | null {
  const t = (json as { features?: { properties?: { IDP_FileDate?: string } }[] })?.features?.[0]?.properties?.IDP_FileDate;
  return typeof t === "string" && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(t) ? t : null;
}

/** The storm warnings touching [west, south, east, north] in NOAA's refresh at `time`. */
export function warningsInViewUrl(bounds: [number, number, number, number], time: string): string {
  const box = bounds.map((n) => n.toFixed(4)).join(",");
  return wfsUrl({
    srsName: "EPSG:4326",
    propertyName: "geom,prod_type,cap_id,vtec",
    cql_filter: `BBOX(geom,${box},'EPSG:4326') AND IDP_FileDate = ${time}`,
  });
}

/**
 * The end time in a VTEC code ("/O.NEW.KTAE.FF.W.0045.261009T2327Z-261010T0530Z/"),
 * or null when it's open-ended ("000000T0000Z"). NOAA's own end times are
 * labeled UTC but are the office's local time, so this is used instead.
 */
export function vtecEnd(vtec: string | null | undefined): string | null {
  const m = vtec?.match(/-(\d{2})(\d{2})(\d{2})T(\d{2})(\d{2})Z\//);
  if (!m || m[1] === "00") return null;
  const [, yy, mo, dd, hh, mi] = m;
  return `20${yy}-${mo}-${dd}T${hh}:${mi}:00Z`;
}

/** "KTAE.FF.W.0045": which event a VTEC code belongs to, across its updates. */
export function vtecKey(vtec: string | null | undefined): string | null {
  const m = vtec?.match(/^\/[A-Z]\.[A-Z]{3}\.([A-Z]{4})\.([A-Z]{2})\.([A-Z])\.(\d{4})\./);
  return m ? `${m[1]}.${m[2]}.${m[3]}.${m[4]}` : null;
}

/** NOAA's warnings as alerts with their shapes, once each, leaving out any that have ended. */
export function parseWarnings(json: unknown, now = new Date()): NwsAlert[] {
  const features =
    (json as { features?: { geometry?: Geometry | null; properties?: Record<string, string | null> }[] })?.features ?? [];
  const byId = new Map<string, NwsAlert>();
  for (const f of features) {
    const p = f.properties ?? {};
    if (!p.cap_id || !f.geometry || byId.has(p.cap_id)) continue;
    const ends = vtecEnd(p.vtec);
    if (ends && Date.parse(ends) <= now.getTime()) continue;
    byId.set(p.cap_id, {
      id: p.cap_id,
      event: p.prod_type ?? "Alert",
      ends,
      geometry: f.geometry,
      parameters: p.vtec ? { VTEC: [p.vtec] } : undefined,
    });
  }
  return [...byId.values()];
}

const eventKey = (a: NwsAlert) => vtecKey(a.parameters?.VTEC?.[0]) ?? a.id ?? "";

/**
 * What's drawn: the area's own outlined alerts, then NOAA's warnings that
 * aren't among them. NOAA can be an update behind the list, so they're
 * matched on the event (VTEC) as well as the id; the list's copy, with
 * NWS's text, wins.
 */
export function shapesToDraw(own: NwsAlert[], noaa: NwsAlert[]): NwsAlert[] {
  const mine = own.filter((a) => a.geometry);
  const taken = new Set(own.flatMap((a) => [a.id ?? "", eventKey(a)]));
  return [...mine, ...noaa.filter((a) => !taken.has(a.id ?? "") && !taken.has(eventKey(a)))];
}

/** Whether (lon, lat) is inside a polygon's outer ring and none of its holes. */
function inPolygon(rings: Position[][], lon: number, lat: number): boolean {
  const inRing = (ring: Position[]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return rings.length > 0 && inRing(rings[0]) && !rings.slice(1).some(inRing);
}

/** Whether the spot is inside an alert's outline: which overlapping shapes a click was on. */
export function containsPoint(geometry: Geometry | null | undefined, lat: number, lon: number): boolean {
  if (!geometry) return false;
  switch (geometry.type) {
    case "Polygon":
      return inPolygon(geometry.coordinates, lon, lat);
    case "MultiPolygon":
      return geometry.coordinates.some((p) => inPolygon(p, lon, lat));
    case "GeometryCollection":
      return geometry.geometries.some((g) => containsPoint(g, lat, lon));
    default:
      return false;
  }
}

/**
 * The clicked alerts with NWS's text: the list's own have it; for a warning
 * from NOAA it's fetched by id (named by NOAA alone if that fails).
 * `onUpdate` gets them at once, then again with the text filled in.
 */
export async function withNwsText(
  alerts: NwsAlert[],
  onUpdate: (alerts: NwsAlert[], checking: boolean) => void
): Promise<void> {
  const missing = alerts.filter((a) => a.id && a.headline === undefined && a.description === undefined);
  onUpdate(alerts, missing.length > 0);
  if (missing.length === 0) return;
  const fetched = new Map(
    await Promise.all(
      missing.map((a) =>
        api
          .fetchNwsAlert(a.id as string)
          .then((f): [NwsAlert, NwsAlert] => [a, { ...a, ...alertFromFeature(f as { properties?: NwsAlert }), geometry: a.geometry }])
          .catch((): [NwsAlert, NwsAlert] => [a, a])
      )
    )
  );
  onUpdate(
    alerts.map((a) => fetched.get(a) ?? a),
    false
  );
}

/** The popup's content: each alert with its color, area, end, and NWS's text a click away. */
export function alertsPopupContent(alerts: NwsAlert[], checking: boolean): HTMLElement {
  const box = document.createElement("div");
  box.className = "radar-alerts-here";
  for (const a of sortAlerts(alerts)) {
    const item = document.createElement("div");
    item.className = `radar-alert-here weather-alert-${alertLevel(a.event)}`;
    const head = document.createElement("div");
    head.className = "radar-alert-here-head";
    const swatch = document.createElement("span");
    swatch.className = "alert-swatch";
    swatch.style.borderColor = alertColor(a.event);
    const title = document.createElement("strong");
    title.textContent = a.event ?? "Alert";
    head.append(swatch, title);
    const until = untilText(a);
    if (until) {
      const u = document.createElement("span");
      u.className = "radar-alert-here-until";
      u.textContent = until;
      head.appendChild(u);
    }
    item.appendChild(head);
    const area = areaText(a.areaDesc);
    if (area) {
      const d = document.createElement("div");
      d.className = "radar-alert-here-area";
      d.textContent = area;
      d.title = area;
      item.appendChild(d);
    }
    if (a.headline) {
      const h = document.createElement("p");
      h.className = "weather-alert-headline";
      h.textContent = a.headline;
      item.appendChild(h);
    }
    const text = [...paragraphs(a.description), ...paragraphs(a.instruction)];
    if (text.length > 0) {
      const more = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "What NWS says";
      more.appendChild(summary);
      for (const t of text) {
        const p = document.createElement("p");
        p.textContent = t;
        more.appendChild(p);
      }
      item.appendChild(more);
    }
    box.appendChild(item);
  }
  if (checking) {
    const note = document.createElement("div");
    note.className = "settings-hint";
    note.textContent = "Getting NWS's text…";
    box.appendChild(note);
  }
  return box;
}
