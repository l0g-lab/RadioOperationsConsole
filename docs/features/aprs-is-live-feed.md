# Feature: APRS-IS Live Area Feed

## Status

Draft — implemented, replacing the earlier aprs.fi-based feature entirely
(see History).

## Purpose

Lets an operator watch live APRS (Automatic Packet Reporting System)
traffic within a chosen radius of a point, plotted on a map and listed as
a rolling feed. Useful during a net or SKYWARN activation to see what
stations are active in an area — a county, a net's coverage area, a whole
state — without needing to run separate APRS-capable radio/software.

Receive-only (`initial_aprs_mode: receive_only` in `spec-manifest.yaml`):
this application only listens to APRS-IS. It has no APRS transmit
capability and does not beacon this station's own position.

## History

This feature originally worked against the aprs.fi HTTP API: an operator
could look up the current position of specific, already-known call signs
(typically from a check-in roster), but aprs.fi's API has no area or
proximity search — it can only answer "where is this named station," never
"what's active near this point." That version required an aprs.fi API key
and was subject to aprs.fi's terms of use (batching, attribution, no
archival storage).

That version has been removed in full — no aprs.fi code, settings field,
or UI remains — and replaced by direct APRS-IS integration, which can do
what aprs.fi's API never could: stream every packet heard within a
geographic area, not just packets from call signs already known in
advance. This document describes the replacement as built; it does not
describe aprs.fi.

## Relationship to other documents

- Governed by the online-enhancement boundary in
  [02-scope-and-release-boundaries.md](../02-scope-and-release-boundaries.md)
  ("Online map and radar sources"): this is a supporting, on-demand
  capability (`VISION-002`/`005`), not a dependency — the application
  remains fully usable with no APRS-IS connection, and nothing else in the
  application depends on it.
- Reuses the same offline-tile-caching Leaflet basemap built for
  [checkin-location-map.md](checkin-location-map.md) (`CIMAP-050`–`053`)
  rather than a second map implementation — but plots different data with
  a different lifecycle: check-in locations are this application's own
  stored records, while this feature's markers are live third-party APRS
  traffic pulled fresh from the network and never written to storage
  (see Non-goals).
- The call sign used to connect is the focused operator's, as defined in
  [04-domain-language.md](../04-domain-language.md) and entered per
  [weekly-net-operations.md](weekly-net-operations.md)'s Operators panel —
  this feature does not collect or store a separate call sign of its own.

## The APRS-IS network's actual shape

This shapes what's buildable here, so it's worth stating plainly rather
than discovering it mid-implementation:

- **A live feed, not a queryable history.** APRS-IS is a streaming
  network, not a database with a time-range API. Connecting only yields
  packets from that moment forward; there is no way to ask a public
  APRS-IS server for "everything from the last 30 minutes" retroactively.
  A rolling window is achieved by the client holding on to what it has
  received since connecting, not by querying the past.
- **Area filtering is real here, unlike aprs.fi.** A radius filter
  (`r/lat/lon/km`) sent at login scopes the feed to a geographic area.
  APRS-IS has no concept of county or state boundaries — a radius around a
  chosen point is the closest equivalent it supports, so "county-sized" or
  "state-sized" filter presets are approximations, not actual boundary
  lookups.
- **No API key; a plain TCP protocol.** APRS-IS logins are a single text
  line (`user CALL pass PASSCODE vers NAME VERSION filter FILTER`) sent
  over a raw TCP connection (port 14580), not an HTTP API. A passcode of
  `-1` requests a read-only session — sanctioned for exactly this
  "just listen" use case, requiring no registration.
- **Some servers reject well-known placeholder call signs.** A generic
  placeholder (e.g. `N0CALL`) was observed being rejected outright by one
  backend node behind a round-robin APRS-IS hostname, while accepted by
  another; behavior isn't uniform across the network. Requiring a real
  call sign sidesteps the inconsistency entirely and is better etiquette
  regardless of whether a given server happens to allow anonymous logins.
- **The server, not just the client, can end the session.** Unlike a
  request/response API where "the request failed" is the only failure
  mode, a live TCP connection can be closed by the server at any point
  after a successful login (a rejected login answered after the fact, a
  server-side policy decision, a network interruption) — this must be
  surfaced to the operator, not left to look like a silently-empty feed.

## Choosing an area

- **APRSIS-001:** The operator MUST be able to choose the feed's center
  point using the same location-picker entry methods already established
  for operator/activity locations (`CIMAP-073`): free-text search,
  clicking a map, or typing exact coordinates.
- **APRSIS-002:** The operator MUST be able to choose a radius from a set
  of presets described in terms an operator would recognize, in miles (15 mi
  local, 45 mi county, 125 mi multi-county, 300 mi state), rather than only
  a raw figure, while the actual filter sent MUST be a plain radius —
  APRS-IS has no boundary-aware filter type to request instead.
- **APRSIS-003:** The chosen area and radius MUST remain visible while a
  feed is running, in the tab's heading ("APRS — Orlando, FL · 45 mi"), with
  a green **Live** and how many stations and packets while connected. The
  area is changed from *Change area* (not while streaming).

## Connecting and identification

- **APRSIS-010:** Starting a feed MUST require a real call sign — the
  focused operator's, per `weekly-net-operations.md` — and MUST NOT fall
  back to a generic placeholder call sign. If no operator with a call sign
  is focused, starting MUST be disabled with an explanation rather than
  silently substituting one.
- **APRSIS-011:** The application MUST identify itself (name and version)
  in the APRS-IS login line's `vers` field on every connection, the
  protocol-level equivalent of the User-Agent identification this
  application already sends on its HTTP-based connectors (`QRZ-*`).
- **APRSIS-012:** The application MUST connect read-only (passcode `-1`)
  and MUST NOT be able to transmit or inject packets onto APRS-IS,
  consistent with `initial_aprs_mode: receive_only`.
- **APRSIS-013:** A login the server responds to with an explicit
  rejection MUST be reported to the operator as a clear error, not treated
  as a successful, silently-empty stream.
- **APRSIS-014:** A connection that closes on its own after a feed has
  already started — whether from a server-side decision or a network
  interruption — MUST be reported to the operator with the reason, and the
  feed's running/stopped status MUST update to reflect it, rather than
  continuing to display as active with nothing arriving.

## Receiving and displaying traffic

- **APRSIS-020:** Every packet received while a feed is running MUST be
  added to the feed, whether or not its position can be decoded (see
  `APRSIS-022`) — a packet the application can't fully interpret is still
  evidence of activity, not something to discard.
- **APRSIS-021:** The feed MUST be presented as a rolling window of
  whatever has arrived in roughly the last 30 minutes, aging out older
  entries as new ones arrive, consistent with this being a live feed with
  no history to backfill (see above).
- **APRSIS-022:** The application MUST decode standard uncompressed
  position reports into coordinates for plotting. Compressed and Mic-E
  position encodings, and non-position packet types (telemetry, weather,
  status, objects, messages, bulletins), are not decoded into coordinates;
  such packets MUST still appear in the feed per `APRSIS-020`, without a
  plotted position.
- **APRSIS-023:** Stations with a decoded position MUST be plotted on the
  same offline-tile-caching basemap used elsewhere in this application
  (`CIMAP-050`), fitted to the chosen radius (drawn faintly): one marker per
  station at its latest position, labeled with its call sign, colored by its
  kind (`APRSIS-025`), with a dashed trail for one that has moved. A
  marker's popup MUST show its call sign, kind, and comment.
- **APRSIS-024:** The feed MUST bound its retained packet count
  independently of the 30-minute window, so a high-traffic area or radius
  cannot grow memory usage without limit.
- **APRSIS-025:** Beside the map, the feed MUST be shown as **stations**, not
  packets: one per call sign, most recently heard first, each with an icon
  and kind from its APRS symbol (Mobile, Home, Weather, Digipeater, IGate,
  On foot…; colored moving, fixed, weather, or infrastructure, clear of the
  app's amber, red, and green), when it was last heard ("4 min ago";
  dimmed after 15 minutes quiet), how far and which way from the center
  ("4.2 mi NE"), and its latest comment. Clicking one MUST find it on the map.
- **APRSIS-026:** A weather station's report MUST be put in words ("88°F ·
  wind W 12 mph gusting 18 · humidity 78% · 1014 hPa") from the APRS weather
  format, keeping any text after it.
- **APRSIS-027:** The packets themselves MUST remain available, behind *Show
  raw packets*, with 24-hour times, for troubleshooting.

## Stopping and lifecycle

- **APRSIS-030:** The operator MUST be able to stop a running feed
  explicitly at any time.
- **APRSIS-031:** Navigating away from the feed (closing the view it's
  shown in) MUST stop the underlying connection automatically, so no
  connection keeps running unattended in the background once its display
  is gone.
- **APRSIS-032:** Starting a new feed while one is already running MUST
  replace it (stopping the old connection) rather than running multiple
  connections concurrently.

## Explicit non-goals for this slice

- Any historical or time-ranged query ("show me the last hour, starting
  now") — not possible against APRS-IS (see above); the 30-minute window
  is a rolling client-side buffer starting from connection time, not a
  server-side query.
- County or state boundary-accurate filtering — APRS-IS only supports a
  radius around a point (`APRSIS-002`); the "county-sized"/"state-sized"
  presets are approximations, not actual administrative boundary lookups.
- Decoding compressed or Mic-E position encodings, or interpreting the
  content of non-position packet types beyond showing their raw text
  (`APRSIS-022`) — a future increment if operators need it.
- Persisting received packets in this application's own database. This is
  a live feed by design, not an artifact of a terms-of-use restriction
  (unlike the removed aprs.fi version) — packets live only in memory for
  the current feed session.
- Transmitting or beaconing this station's own position — out of scope per
  `initial_aprs_mode: receive_only`.
- Linking APRS traffic to check-ins, spotter reports, or incidents — a
  possible future extension, not built here.
- Selecting or configuring which APRS-IS server to connect to — a single
  built-in access point is used; no per-installation server configuration
  is exposed.

## Acceptance examples

```gherkin
Scenario: Choosing an area and starting a feed
  Given the focused operator has a call sign set
  When the operator picks a center point, chooses the "county-sized" preset, and starts the feed
  Then the application connects to APRS-IS read-only using that operator's call sign
  And packets heard within that radius begin appearing in the feed and on the map

Scenario: No operator call sign available
  Given no operator is focused, or the focused operator has no call sign set
  Then starting a feed is disabled with an explanation
  And the rest of the application remains fully usable

Scenario: A packet with an undecodable position still appears
  Given a compressed-format or telemetry packet is received while a feed is running
  Then it appears in the feed list
  And it is not plotted on the map, since its position was not decoded

Scenario: A rejected login is reported, not silently empty
  Given the APRS-IS server rejects the login for the connecting call sign
  Then the operator sees a clear error explaining the feed did not start
  And the feed is not shown as running

Scenario: A connection dropping mid-feed is reported
  Given a feed is running and has received several packets
  When the APRS-IS connection closes on its own
  Then the feed's status updates to reflect it stopped
  And the reason is shown to the operator

Scenario: Stopping and restarting
  Given a feed is running
  When the operator starts a new feed with a different area
  Then the previous connection is stopped
  And only the new area's traffic is received going forward

Scenario: Leaving the feed view stops it
  Given a feed is running
  When the operator navigates away from the view showing it
  Then the underlying APRS-IS connection is closed automatically
```
