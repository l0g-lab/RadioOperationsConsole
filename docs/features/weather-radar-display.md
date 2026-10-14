# Feature: Weather Radar Display

## Status

Draft — implemented.

## Purpose

Shows live radar on the Weather tab on a map the operator can zoom, pan, and
take to full view: NOAA's national radar mosaic over the app's own map,
looping the last hour, with the areas of the NWS alerts in effect outlined.
The designs this replaced are recorded below, since the reasons for leaving
each still matter for not trying it again.

## Relationship to other documents

- Centered on the weather area of interest from
  [nws-alerts.md](nws-alerts.md) (`NWSA-001`–`006`); outlines the same alerts
  the tab lists (`NWSA-016`).
- Drawn on the app's base map (`CIMAP-050`), with its offline-cached tiles
  and its Full view control.

## Superseded designs (kept for context, not current)

1. **Static CONUS image fetch.** A single non-interactive image fetched
   through our own backend. Rejected: the endpoint it depended on
   (`radar.weather.gov/ridge/Conus/RadarImg/latest_radaronly.gif`) was
   retired by NWS, and even a working static image cannot be centered on an
   arbitrary location — it is always the same fixed national crop.
2. **Live Leaflet tile map plus a separate animated-GIF-loop modal.**
   Solved centering (a real pannable/zoomable map) and animation (NWS's own
   per-station `_loop.gif` product) as two different views reachable in two
   different ways. Rejected once both were live at once: a single-frame
   live map and a separate animated loop on the same tab was redundant.
3. **A single embedded-NWS-app view, as a modal/pop-up overlay.** Correct
   on content (one view, one button, deep-linked) but wrong on placement —
   rejected in favor of rendering inline within the tab's own content.
4. **The single embedded-NWS-app view, rendered inline.** Placement fixed,
   but the content choice itself proved wrong: embedding NWS's full radar
   web application (a JS/WebGL mapping SPA) inside this application's
   webview was reported slow and non-functional in practice. This
   application runs on Tauri's platform webview (WebKitGTK on Linux, see
   `ADR-001`), which is a materially different and often less capable
   JS/WebGL engine than a modern desktop Chrome/Firefox — the same page
   that performs acceptably in a regular browser is not guaranteed to in
   this webview, and this application has no visibility into or control
   over a third-party app's internal rendering once embedded. Rejected in
   favor of a plain animated image this application does not need to
   execute any of NWS's JavaScript to display.
5. **NWS's per-station animated loop image (`_loop.gif`), shown inline.**
   Fast and simple, but a fixed picture of one radar site's coverage: no
   zooming in on a street or out to a region, no panning, and a table of
   every NEXRAD site kept in the app only to pick the nearest. Replaced by a
   radar layer on the app's own map with its own loop — which also answers
   design 2's objection, since there is now one view, not a live map and a
   separate loop.


## Display

- **RADAR-001:** The Weather tab MUST show radar as the right column, beside
  Now, the alerts, and the forecast, seen without scrolling: a map a little wider
  than tall (10:9), never taller than the window leaves room for (at least
  300px; it redraws as it's resized), on the app's own map (zoom, pan, and
  **Full view** to fill the window), centered on the weather area, which is
  marked. It's shown at once, with no Show radar step.
- **RADAR-010:** The radar MUST be NOAA's national base-reflectivity mosaic
  (`opengeo.ncep.noaa.gov`, as radar.weather.gov uses), drawn as a layer over
  the map at any zoom, with no key.
- **RADAR-011:** The radar MUST loop every scan of the last hour (about 30,
  two minutes apart; about ten seconds a loop), playing on its own once
  they're in — unless the computer asks for reduced motion, when it starts
  paused on the latest: play/pause, an earlier and a later scan, and the shown
  scan's local time and age ("19:42, 4 min ago"). Pausing or stepping stops
  the loop until played again. The loop MUST NOT move to a scan before it has
  a picture (skipping any NOAA turned away), so it waits on a good frame rather
  than flash a blank one; a refreshed list of scans MUST be looped at once.
  The loop rests briefly on the latest scan, and takes about ten seconds
  whatever the number of scans (a station's are fewer). The list of scans
  MUST be fetched by the application's backend, like its other online
  requests, and *Refresh* fetches it again.
- **RADAR-014:** While shown and online, the radar MUST check for new scans
  every five minutes, adding them to the loop and unloading scans that have
  aged out of the hour, so a radar left up stays current.
- **RADAR-015:** If NOAA's list of scans can't be had, the radar MUST still
  work, asking for times two minutes apart over the last hour; NOAA answers
  each with its nearest scan.
- **RADAR-016:** Each scan MUST be one picture of exactly the map's view (a
  WMS GetMap for its bounds and size), not a dozen tiles — about 30 requests a
  loop instead of hundreds, which NOAA's delivery network throttles — redrawn
  for a new view once a pan or zoom has finished — the current scan's first —
  at the screen's own pixel density, so it isn't blown up on a high-resolution
  screen. Until a scan's new picture arrives its last one MUST stay, in its
  place, so a pan or zoom never blanks the radar, stretches it, or stalls the
  loop. If NOAA turns a picture away, the radar MUST say its server is busy and that it will try again at
  the next refresh, rather than show nothing.
- **RADAR-020:** From zoom 9 in, where the national mosaic's 1 km blocks
  show, the radar MUST be the nearest NEXRAD station's super-resolution
  reflectivity (`<id>/<id>_sr_bref`, about four times finer), as
  radar.weather.gov does — the station shown kept while it's within 150 km of
  the view's middle, so a pan doesn't flip between two — and the national
  mosaic farther out or with no station in range. The status MUST name the
  station ("KEVX · 22:10, 4 min ago"). A station with no scans in the last
  hour MUST fall back to the national mosaic. On changing radar, the last
  one's picture MUST stay until the new one's arrives. The stations and
  their positions are built in (from NWS's /radar/stations).
- **RADAR-017:** In Full view, where the panel's controls are hidden behind
  the map, a small strip in the map's bottom-left corner MUST give the loop's
  earlier / play-pause / later, the shown scan's time (or why there's no
  radar), the opacity slider (`RADAR-012`), and the Alerts checkbox
  (`RADAR-013`, `RADAR-018`). Pressing, double-clicking, or scrolling on it MUST NOT pan or zoom
  the map.
- **RADAR-012:** An opacity slider MUST let the map show through the radar;
  the choice is remembered on this computer.
- **RADAR-013:** The areas of the NWS alerts in effect MUST be outlined on the
  map, each in its kind's NWS color (`RADAR-019`) — warnings solid, watches,
  advisories, and statements dashed — and can be hidden. Alerts given only by
  whole counties (no outline) MUST be counted in a note pointing to the
  Alerts list.
- **RADAR-018:** Every storm-based warning in effect anywhere the map shows
  (tornado, severe thunderstorm, flash flood, special marine, snow squall),
  not only those covering the area, MUST be drawn as a shape like the area's
  own alerts — from NOAA's `wwa` WFS (`warnings` layer) for the view's
  bounds, at NOAA's latest refresh (`IDP_FileDate`, the newest record's, as
  radar.weather.gov asks; NOAA keeps every refresh side by side) — over the
  radar, asked for again when the view settles and on each refresh
  (`RADAR-014`), each once, the list's copy winning where it's the same event
  (VTEC), and shown or hidden with the area's alerts. Watches and advisories
  by county are left off: drawn by county they'd cover the radar. NOAA's own
  start and end times are the office's local time mislabeled UTC, so ends
  come from VTEC, and ended warnings are left out.
- **RADAR-019:** Every alert MUST be shown in the color NWS gives its kind on
  its hazard map — the five storm warnings in radar.weather.gov's colors —
  over a light halo, on the radar and as a small outline swatch by each alert
  in the Alerts list that's outlined there, so an outline can be matched to
  its alert. Pointing at a shape MUST thicken it, and clicking it MUST open a
  popup of that alert (every shape under the click, where they overlap): its
  color, name (red/amber as in the list), area, end, headline, and NWS's full
  text a click away; for a warning not in the list, NWS's text is fetched by
  id. Clicking where there's no shape does nothing.

## Freshness and failure

- **RADAR-007:** Radar MUST NOT be saved to disk — old radar is worse than
  none — while the base map keeps working offline from its saved tiles.
- **RADAR-008:** Working offline, nothing MUST be fetched; the radar is hidden
  with the rest of the tab's weather, which says it needs the internet. A
  failure to reach the radar MUST say so, without blocking the rest of the
  tab.

## Explicit non-goals for this slice

- Other radar products (velocity, storm-relative motion, precipitation
  totals), future radar, and lightning — base reflectivity only.
- Embedding any NWS web application — rejected per superseded design 4.
- Spotter reports on the radar map; the Spotter Reports tab has its own.

## Acceptance examples

```gherkin
Scenario: Radar opens looping the last hour
  Given a weather area of interest is configured near Orlando, FL
  When the operator opens the Weather tab
  Then the radar map loops the last hour of scans over the app's map around Orlando
  And it says when the scan shown was ("19:42, 4 min ago")

Scenario: Reduced motion
  Given the computer is set to reduce motion
  When the operator opens the Weather tab
  Then the radar shows the latest scan, paused, until played

Scenario: Zooming in on a storm
  Given the radar map is showing
  When the operator zooms in and pans to a storm
  Then the radar redraws at that zoom over the streets
  And Full view shows the same map filling the window

Scenario: A warning's area is outlined
  Given a Severe Thunderstorm Warning with an area is in effect
  Then its area is outlined in yellow on the radar map
  And the Alerts list shows a yellow swatch by it
  And clicking it shows the warning, its counties, when it ends, and NWS's text

Scenario: A warning in the next county
  Given a Tornado Warning in effect in view but not covering the area
  Then it's outlined in red on the radar map
  And clicking it shows the Tornado Warning with NWS's text

Scenario: Working offline
  Given the operator is working offline
  Then the Weather tab says the weather needs the internet
  And nothing is fetched
```
