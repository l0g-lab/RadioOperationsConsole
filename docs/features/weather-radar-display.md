# Feature: Weather Radar Display

## Status

Draft — first vertical slice in active implementation.

## Purpose

Shows live, animated NEXRAD radar on the Weather tab, on demand, centered
on the operator's configured weather area of interest — or a national view
when no area is configured. This document has gone through several designs
in this same slice; each is recorded below as superseded rather than
deleted from history, since the reasoning for rejecting each still matters
for not re-trying it later.

The current design displays NWS's own pre-rendered animated radar-loop
image directly — not an interactive map, not an embedded copy of NWS's web
application, just their already-animated GIF shown with a plain `<img>`.
This is a deliberately narrow choice made after a heavier alternative
(embedding NWS's full radar web app in an iframe) proved slow and
unreliable in practice inside this application's webview.

## Relationship to other documents

- Shares the weather area of interest setting defined in
  [nws-alerts.md](nws-alerts.md) (`NWSA-001`–`006`) — this feature does not
  introduce a second location control.
- Uses the NEXRAD station table and nearest-station selection first
  introduced for the animated-loop design and kept through every later
  revision.
- Governed by the online-enhancement boundary in
  [02-scope-and-release-boundaries.md](../02-scope-and-release-boundaries.md)
  ("Online map and radar sources") and `VISION-005` (supporting, not
  required).
- Supersedes all prior designs in this document's history (below). Code and
  settings specific to superseded designs are removed rather than kept
  alongside the current one.

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

## Display

- **RADAR-001:** The Weather tab MUST show radar only on explicit request,
  via a single, clearly labeled button (`UX-007`). Radar content MUST NOT
  render automatically when the tab opens (`VISION-005`: supporting, not
  ambient).
- **RADAR-002:** The Weather tab MUST NOT present more than one radar view
  at a time. A single button opens a single view.
- **RADAR-003:** The radar view MUST display NWS's own pre-rendered
  animated radar-loop image directly (a plain image element), not an
  embedded copy of any NWS web application and not any rendering, tiling,
  panning, zooming, or animation logic implemented in this application.
- **RADAR-004:** When a weather area of interest is configured (`NWSA-004`),
  the image MUST be NWS's per-station loop for the NEXRAD station nearest
  the resolved coordinates, using the existing offline station table (no
  network lookup required to pick the station).
- **RADAR-005:** When no weather area of interest is configured, the image
  MUST be NWS's national (`CONUS`) loop.
- **RADAR-006:** The operator MUST be able to dismiss the radar view and
  return to the rest of the Weather tab without side effects on any other
  application state.
- **RADAR-009:** The radar view MUST render inline within the Weather tab's
  own content, as part of the normal page, rather than as a separate
  overlay, pop-up, or modal window.

## Freshness and failure

- **RADAR-007:** The loop MUST offer a manual refresh control and SHOULD
  refresh automatically on an interval consistent with the source's own
  update cadence (NWS's loop images are cached roughly 2 minutes at the
  source), so it does not go stale while the operator has it open.
- **RADAR-008:** A failure to load the image (offline, source unreachable)
  MUST be visible in the radar view without blocking the rest of the
  Weather tab or the application. Because this is a plain image element,
  load failure is directly detectable and MUST be reported as such, rather
  than failing silently or opaquely the way an embedded third-party app's
  internal failures would.

## Explicit non-goals for this slice

- Any radar rendering, tiling, compositing, or frame-timing logic in this
  application — NWS's image is already animated; this application only
  displays it.
- Embedding any NWS web application (interactive map, layer controls, etc.)
  — rejected per superseded design 4, above.
- Alternate radar products (velocity, storm-relative motion, precipitation
  totals) — base reflectivity only, whatever the station loop shows.
- Letting the operator pick a specific station manually instead of using
  nearest-station selection — deferred; not needed for the stated use case.
- Precise "as of" freshness timestamps for the displayed sweep — periodic
  and manual refresh are this slice's freshness mechanism.

## Acceptance examples

```gherkin
Scenario: Radar is not loaded until requested
  Given the operator has not clicked "Show radar"
  When the Weather tab is open
  Then no radar content has been requested

Scenario: Radar shows the nearest station's loop when an area is configured
  Given a weather area of interest is configured near Miami, FL
  When the operator clicks "Show radar"
  Then NWS's animated loop for the nearest station (KAMX) is displayed
  And it renders as a plain animated image, not an embedded application

Scenario: Radar falls back to the national loop with no area configured
  Given no weather area of interest is configured
  When the operator clicks "Show radar"
  Then NWS's national CONUS animated loop is displayed

Scenario: Radar renders inline, not as a separate window
  Given the operator clicks "Show radar"
  When the radar view appears
  Then it renders within the Weather tab's own content
  And no separate overlay, pop-up, or modal window is shown

Scenario: A load failure is visible, not silent
  Given the radar image fails to load (offline, source unreachable)
  When the operator has the radar view open
  Then a clear failure message is shown in the radar view
  And the rest of the Weather tab and the application remain usable
```
