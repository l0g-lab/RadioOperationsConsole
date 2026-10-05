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
  data already stored on that check-in record — its coordinates, resolved
  once when it was saved or set by hand ([location-resolution.md](location-resolution.md))
  — as of when the map is opened. It MUST NOT
  re-query QRZ or any callbook connector for the call sign's directory
  location.
- **CIMAP-002:** When an operator has edited, cleared, or manually entered a
  check-in's QTH location, grid square, or address — overriding or bypassing
  any QRZ suggestion — the map MUST plot that stored value. It MUST NOT
  substitute a QRZ-linked location for the call sign instead.
- **CIMAP-003:** A check-in MUST record whether its location was placed by
  hand (picked on the map, typed as coordinates or a mile marker, or a range
  check's pin) or worked out from its details (QRZ's exact point, the
  address's ZIP, the grid square, or the QTH). A location worked out
  automatically MUST be worked out again when a lookup is run on the check-in
  (`QRZ-035`) or its QTH, grid square, or address is edited, keeping the old
  point if the new details give none. A location placed by hand MUST NOT be
  changed by either. Check-ins logged before this was recorded count as
  automatic, except range checks.

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

## Entering a location

- **CIMAP-080:** The check-in form and the check-in edit row MUST ask for a
  station's location in **one Location box**, with a **Map** button to pick
  the exact spot. A call-sign lookup fills it with the full address, else the
  QTH. It MUST accept an address, town or ZIP, a cross street, a mile marker,
  a grid square, or GPS coordinates, and on saving sort it into the check-in's
  separate fields (`QRZ-027`), best first: a spot picked on the map; typed
  coordinates; a mile marker; a grid square typed on its own; the lookup's
  exact point (if the box still holds what the lookup found); the online map
  search, only when online; a ZIP code's centre; the lookup's grid square.
  When there's no grid square, it MUST be worked out from the map position.
  A line under the box MUST say where the station will land, or that it
  can't be placed and how to place it. A spot picked on the map, typed
  coordinates, and a mile marker are placed by hand (`CIMAP-003`).
- **CIMAP-081:** A net's roster MUST show call sign, name, location (the QTH,
  else the address, marked when it's on the map), grid square, time, and
  traffic. The full address, coordinates, and how it was placed MUST be shown
  on hovering over the location. Exports keep every field.

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

## Net control, repeater, and distance

Net control can locate themselves on the same map used for check-ins, along
with the repeater the net runs on, and see how far each checked-in station
is — useful for propagation and coverage awareness during a net.

- **CIMAP-060:** Net control's location on this map MUST be resolved
  with this precedence: (1) a location set on the focused activity itself,
  when present, else (2) the location recorded for the currently selected
  operator profile. An operator's activity-specific location (e.g. a field
  site or county EOC) overrides their own default location for that
  activity only; it does not change the operator's stored default. Both are
  entered the same way (`CIMAP-073`), not as differently-entered location
  concepts.
- **CIMAP-061:** When net control's location is resolved, the map MUST plot
  it with a marker visually distinct from check-in markers, and the
  activity's repeater, when it has one, with another (`CIMAP-070`,
  `RPT-030`).
- **CIMAP-062:** When there is neither a repeater nor a location for net
  control, the map MUST omit those markers and any distance lines without
  error, mirroring `CIMAP-013`'s treatment of a check-in with no resolvable
  location.
- **CIMAP-063:** The map MUST draw a line from each resolved check-in to the
  repeater when the activity has one, else to net control, labeled with the
  distance between them, and a line in a different color from net control
  to the repeater (`RPT-031`).
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

- **CIMAP-070:** Check-in markers MUST be small dots in a color clearly
  visible against the basemap. Net control and the repeater MUST be shown
  as icons (a radio and an antenna tower) in round badges, so they never
  read as check-ins, with a key above the map.
- **CIMAP-072:** Distance lines MUST use a line weight and color that keep
  them clearly visible against the basemap and easy to point at/hover over,
  distinct from the marker colors. Lines to check-ins are dashed; the line
  from net control to the repeater is solid and a different color.
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

- Bulk bounding-box/radius search or routing between stations. Point-to-
  point distance from each check-in to the repeater or net control is
  covered by `CIMAP-063`; general station-to-station distance or routing is
  not.
- A location-picker workflow for spotter reports is now covered by
  `skywarn-incidents-and-reports.md` (`SPOT-004`), reusing this feature's
  `LocationPicker` component rather than a second implementation. Incident
  location-picking remains unbuilt, tracked as a future increment there.
- Moving net control or the repeater from this map (dragging their
  markers) — they are set from the Operations tab, not from here.

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

Scenario: Net control's location shows distance to each check-in
  Given the current operator has a location set and the activity has no repeater
  When the operator opens the check-in location map
  Then net control shows with a radio icon, distinct from check-in markers
  And a line from each resolved check-in to net control shows the distance between them

Scenario: On a repeater, distances run from the repeater
  Given the activity has a repeater and the operator has a location
  When the operator opens the check-in location map
  Then the repeater shows with an antenna-tower icon and net control with a radio icon
  And dashed lines run from the repeater to each check-in with the distance
  And a solid line in another color joins net control and the repeater

Scenario: No location means no distance lines
  Given the current operator has no location set and the activity has no repeater
  When the operator opens the check-in location map
  Then no net-control marker or distance lines appear
  And check-in pins still display normally
```
