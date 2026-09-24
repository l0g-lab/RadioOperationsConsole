# Feature: Check-in Location Map

## Status

Draft — first vertical slice in active implementation.

Coordinate resolution has since moved to
[location-resolution.md](location-resolution.md) (`LOCRES-*`): the map plots
coordinates stored on each check-in when it is saved, resolved offline first
(exact point, QRZ, ZIP centroid, grid square) rather than geocoding text at
view time. Where `CIMAP-010`–`CIMAP-015` below describe geocode-based
resolution, `LOCRES-*` governs.

## Purpose

Lets an operator see, at a glance, where checked-in stations are located,
plotted from the location data already stored on each check-in — never from
a fresh callbook lookup. This is an on-demand supporting view reached from
the Check-ins workspace, not part of the rapid check-in entry path.

## Relationship to other documents

- Builds on the QTH location, grid square, and full address fields defined
  in [qrz-callsign-enrichment.md](qrz-callsign-enrichment.md) and stored per
  `DOMAIN-001`/`DOMAIN-002` as directory data distinct from any reported or
  mapped location.
- Elaborates the "Map as a supporting tool" section of
  [06-application-shell-and-navigation.md](../06-application-shell-and-navigation.md)
  (`UX-MAP-*`), applied here to the Check-ins roster rather than a report
  form's location picker.
- Narrower than, and a foundation for, the originally-planned
  `map-geocoding-and-radar` feature, since superseded: this document covers
  check-in location plotting; weather radar imagery is covered by
  [weather-radar-display.md](weather-radar-display.md) (`RADAR-*`); spotter
  report location-picking (`UX-MAP-001`–`005`) is covered by
  [skywarn-incidents-and-reports.md](skywarn-incidents-and-reports.md)
  (`SPOT-004`), which reuses this document's `LocationPicker` component
  rather than building a second one. Incident location-picking remains
  unbuilt, tracked as a future increment in that same document.
- Governed by the online-enhancement boundary in
  [02-scope-and-release-boundaries.md](../02-scope-and-release-boundaries.md)
  ("Online geocoding and reverse geocoding", "Online map and radar sources").
- Reuses the same free-text-to-coordinates resolution already established
  for the weather area of interest ([nws-alerts.md](nws-alerts.md),
  `NWSA-001`–`002`) for the operator's own location, rather than inventing a
  second location-entry pattern.

## Core principle: stored data, not re-derived data

- **CIMAP-001:** The map MUST plot each check-in using only the location
  data already stored on that check-in record (`qth_location`,
  `grid_square`, `address`) as of when the map is opened. It MUST NOT
  re-query QRZ or any callbook connector for the call sign's directory
  location.
- **CIMAP-002:** When an operator has edited, cleared, or manually entered a
  check-in's QTH location, grid square, or address — overriding or bypassing
  any QRZ suggestion — the map MUST plot that stored value. It MUST NOT
  substitute a QRZ-linked location for the call sign instead.

## Coordinate resolution

Grid square math is exact and fully offline; geocoding is an online
fallback for check-ins that have location text but no grid square.

- **CIMAP-010:** When a check-in has a grid square, the application MUST
  derive coordinates from it using standard Maidenhead locator math,
  entirely offline, with no network request.
- **CIMAP-011:** When a check-in has no grid square but has a QTH location
  or full address, the application MUST attempt to resolve coordinates by
  geocoding that stored text through an online geocoding connector.
- **CIMAP-012:** Geocoding MUST prefer the full address over the shorter QTH
  location when both are present, as the more specific query.
- **CIMAP-013:** A check-in with neither a grid square nor any QTH
  location/address text MUST be omitted from the map without error.
- **CIMAP-014:** Geocoding MUST run asynchronously and MUST NOT block the
  map from displaying pins that were already resolved (from grid squares)
  while other lookups are still in flight.
- **CIMAP-015:** Geocoding requests for multiple check-ins in the same map
  session MUST be throttled sequentially rather than issued in parallel, to
  respect the geocoding provider's usage policy.

## Offline and failure behavior

- **CIMAP-020:** The map MUST open and render whatever pins are resolvable
  (typically grid-square-derived) with no network access at all, consistent
  with `VISION-002`.
- **CIMAP-021:** A failed or offline geocoding attempt for a given check-in
  MUST silently omit that pin rather than blocking the map or showing an
  error dialog, mirroring `QRZ-030`'s treatment of connectivity failures.
- **CIMAP-022:** Geocoding requests MUST use a bounded timeout so a lack of
  connectivity fails fast per check-in rather than stalling the whole map.
- **CIMAP-023:** The basemap imagery itself requires internet access;
  failure to load tiles MUST NOT prevent already-resolved pins from being
  visible or prevent the map from opening.

## Access and interaction

- **CIMAP-030:** The check-in location map MUST be reachable from the
  Check-ins workspace via an explicit, labeled button, not opened
  automatically (`UX-007`).
- **CIMAP-031:** Opening the map MUST NOT alter, save, or "correct" any
  check-in's stored location data; it is read-only with respect to check-in
  records.
- **CIMAP-032:** Each pin MUST identify at least the call sign and the
  stored location text (or grid square) it was plotted from, so the
  operator can see which check-ins are shown and why a pin is where it is.
- **CIMAP-033:** The map MUST reflect only check-ins currently on the active
  roster for the focused activity; voided/removed check-ins (`NETOPS-032`)
  MUST be excluded.

## Settings

- **CIMAP-040:** The default geocoding provider MUST work without requiring
  the operator to obtain or configure an API key, so this feature works out
  of the box like grid-square plotting does.

## Offline tile caching

The basemap itself is the one part of this feature that inherently needs a
network connection (`CIMAP-023`). Caching tiles as they load narrows that
gap: an area already viewed once stays viewable later without one.

- **CIMAP-050:** Basemap tiles MUST be cached locally as they are loaded, so
  a previously-viewed map area remains viewable without a network
  connection.
- **CIMAP-051:** Tile caching MUST degrade gracefully when the browser
  storage APIs it depends on are unavailable — the map still functions
  online, without caching, rather than failing to load.
- **CIMAP-052:** A tile that is neither cached nor reachable MUST leave that
  area of the map blank rather than blocking the rest of the map or the
  application (extends `CIMAP-023`).
- **CIMAP-053:** Cached tiles MUST persist across application restarts, not
  just the current session, so a previously-viewed area stays available
  offline later without having to be reloaded online first.

## Operator location and distance

An operator can locate themselves on the same map used for check-ins, and
see how far each checked-in station is from them — useful for propagation
and coverage awareness during a net.

- **CIMAP-060:** The reference location used on this map MUST be resolved
  with this precedence: (1) a location set on the focused activity itself,
  when present, else (2) the location recorded for the currently selected
  operator profile. An operator's activity-specific location (e.g. a field
  site or county EOC) overrides their own default location for that
  activity only; it does not change the operator's stored default. Both are
  entered the same way (`CIMAP-073`), not as differently-entered location
  concepts.
- **CIMAP-061:** When a reference location is resolved (activity or
  operator), the map MUST plot it with a marker visually distinct from
  check-in markers (`CIMAP-070`).
- **CIMAP-062:** When neither the focused activity nor the current operator
  has a location set, the map MUST omit the reference marker and any
  distance lines without error, mirroring `CIMAP-013`'s treatment of a
  check-in with no resolvable location.
- **CIMAP-063:** When a reference location is resolved, the map MUST draw a
  line from each resolved check-in to it, labeled with the distance between
  them.
- **CIMAP-064:** Distance MUST be computed offline from the two known
  coordinates (no network request), consistent with `CIMAP-010`'s offline
  grid-square math.
- **CIMAP-065:** When an operator profile is created with a call sign, the
  application MUST attempt to seed that operator's default location
  automatically from QRZ directory data (grid square preferred, offline
  math per `CIMAP-010`; QTH/address geocoded as a fallback per `CIMAP-011`),
  the same connector used for check-in call-sign enrichment (`QRZ-*`). A
  failed, unconfigured, or offline lookup MUST leave the location unset
  without error (`QRZ-030`), not block operator creation.
- **CIMAP-066:** An operator's location — whether auto-seeded or blank —
  MUST remain editable at any time via an explicit "Edit location" action,
  using any of the three entry methods in `CIMAP-073`. Editing it overrides
  whatever was auto-seeded; it does not re-run the QRZ lookup.
- **CIMAP-067:** The operator list MUST show each operator's resolved
  location (auto-seeded or manually set) alongside their name and call sign
  as a compact summary, e.g. "Logan — Palmetto Bay, FL — W0LAB", rather than
  requiring a separate view to see it. An operator with no location set
  MUST omit that segment rather than showing an empty placeholder.
- **CIMAP-068:** Unlike the operator location panel, per-activity and
  per-operator location detail (coordinates and grid square, `CIMAP-069`)
  MUST NOT be shown unconditionally in the operator list row — only the
  human-readable label. Coordinates/grid square are secondary detail shown
  where the activity or its location-editing UI is already in view, not in
  the compact list summary.
- **CIMAP-069:** Wherever an activity's location is shown as information
  about that activity — the Operations tab and the Check-ins workspace —
  the coordinates and the grid square (derived offline from those
  coordinates, `CIMAP-010`'s math run in reverse) MUST both be displayed
  alongside the human-readable label, not just the label alone.

## Presentation

- **CIMAP-070:** Check-in markers MUST be small and MUST use a color
  distinguishable from the operator marker and from the basemap, while
  remaining clearly visible against it. The operator marker MUST use the
  same circle-marker style as check-in markers (not a differently-shaped
  icon), distinguished only by color, so both read as the same kind of
  station marker.
- **CIMAP-072:** Distance lines MUST use a line weight and color that keep
  them clearly visible against the basemap and easy to point at/hover over,
  distinct from both the check-in and operator marker colors.
- **CIMAP-073:** Setting either the operator's default location or an
  activity's location MUST support three entry methods, since a site may
  not have a zip code, address, or grid square known offhand: free-text
  search (existing geocoding path), clicking/dragging a pin directly on a
  map, and typing exact GPS coordinates (decimal degrees). All three MUST
  end up setting the same underlying lat/lon, so whichever method was used
  last is authoritative.
- **CIMAP-071:** The basemap MUST be the standard OpenStreetMap tile style
  (`tile.openstreetmap.org`), free and requiring no API key. A CartoDB
  dark-tile style was tried here and reverted: CartoDB's public basemap
  tiles now require an API key, and their tile server returns this as a
  rendered "API key required" placeholder image with an HTTP 200 status
  rather than an error code — checking response headers alone does not
  reveal it; the actual tile image content must be inspected.

## Explicit non-goals for this slice

- Persisting resolved check-in coordinates back onto the check-in record,
  or caching them beyond the current map session's in-memory cache. (This
  is distinct from tile caching, `CIMAP-050`, which caches basemap imagery,
  not check-in coordinates.)
- Bulk bounding-box/radius search or routing between stations. Point-to-
  point distance from each check-in to the operator location is covered by
  `CIMAP-063`; general station-to-station distance or routing is not.
- Editing a check-in's location by dragging a map pin — the existing edit
  form (`NETOPS-030`) remains the only way to change stored location text.
- A location-picker workflow for spotter reports is now covered by
  `skywarn-incidents-and-reports.md` (`SPOT-004`), reusing this feature's
  `LocationPicker` component rather than a second implementation. Incident
  location-picking remains unbuilt, tracked as a future increment there.
- Editing the operator's location from this map (dragging its marker,
  etc.) — it is set from the Operations tab (`UX-OPS-010`-style correction),
  not from here.

## Acceptance examples

```gherkin
Scenario: Grid-square check-ins plot with no internet
  Given a focused activity has check-ins with grid squares and no internet connection
  When the operator opens the check-in location map
  Then pins appear for every check-in with a grid square
  And no error appears despite the missing connection

Scenario: Manually entered location overrides QRZ
  Given a check-in's QTH location was auto-filled from QRZ as "El Paso, TX"
  And the operator edited it to "Alamogordo, NM" before saving
  When the operator opens the check-in location map
  Then the pin for that check-in reflects Alamogordo, NM
  And it does not reflect the QRZ-linked location for that call sign

Scenario: No location data is omitted, not an error
  Given a check-in has no grid square, QTH location, or address
  When the operator opens the check-in location map
  Then that check-in has no pin
  And the map still opens normally for the other check-ins

Scenario: A previously viewed area stays viewable offline
  Given the operator viewed a map area while online
  And the application is later reopened with no internet connection
  When the operator opens the check-in location map over that same area
  Then the previously cached tiles are shown

Scenario: Operator location shows distance to each check-in
  Given the current operator has a location set
  When the operator opens the check-in location map
  Then the operator's location shows with a marker distinct from check-in markers
  And a line from each resolved check-in to the operator shows the distance between them

Scenario: No operator location means no distance lines
  Given the current operator has no location set
  When the operator opens the check-in location map
  Then no operator marker or distance lines appear
  And check-in pins still display normally
```
