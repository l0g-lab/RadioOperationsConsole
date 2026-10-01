# Feature: NWS Alerts

## Status

Draft — first vertical slice in active implementation.

## Purpose

Lets an operator scope which NWS active alerts the application fetches to a
specific area of interest, instead of every active alert nationwide. This is
what makes the Weather tab usable during a live net or SKYWARN activation —
an operator cares about alerts for their coverage area, not the whole
country.

## Relationship to other documents

- Reuses the geocoding connector introduced for
  [checkin-location-map.md](checkin-location-map.md) (`CIMAP-011`) for the
  same free-text-to-coordinates resolution and the same offline-safe
  behavior — no new external dependency or API key.
- The configured area is a concrete instance of the "coverage area" concept
  named in [03-personas-and-operating-context.md](../03-personas-and-operating-context.md)'s
  Administrator persona.
- Governed by the "NWS alert retrieval and caching" capability and the
  online-enhancement boundary in
  [02-scope-and-release-boundaries.md](../02-scope-and-release-boundaries.md)
  (`VISION-005`: supporting, not required).
- Respects `STORAGE-010`: the resolved area retains its source query,
  resolution time, and the label the geocoder returned.

## Area of interest resolution

Operators may not know their NWS zone/county UGC code, and may or may not
know their zip code, so the input is free text resolved the same way
regardless of which of those they type.

- **NWSA-001:** The operator MUST be able to enter free text — zip code,
  city/state, address, or landmark — identifying their weather area of
  interest.
- **NWSA-002:** The entered text MUST be resolved to coordinates via the
  same geocoding connector used for check-in locations (`CIMAP-011`).
- **NWSA-003:** A successful resolution MUST show the geocoder's
  human-readable label back to the operator, so they can confirm "79936"
  resolved to the place they meant before relying on it.
- **NWSA-004:** The resolved area (query text, label, coordinates, and
  resolution time) MUST persist across application restarts as an
  application setting.
- **NWSA-005:** The operator MUST be able to change or clear the configured
  area at any time. Clearing it MUST revert to fetching all active alerts
  nationwide (the prior, pre-feature behavior) rather than an error state.
- **NWSA-006:** A failed or no-match resolution MUST be reported clearly at
  the point of entry, and MUST NOT silently leave a stale or incorrect area
  configured.

## Fetching behavior

- **NWSA-010:** Fetching alerts MUST use the persisted resolved coordinates
  without re-geocoding on every fetch. Re-geocoding MUST only occur when the
  operator sets or changes the area text.
- **NWSA-011:** Fetching alerts MUST continue to work when no NWS API key is
  configured (`VISION-005`) — the key is optional and improves the
  connector but never gates it.
- **NWSA-012:** A failed alert fetch (offline, NWS outage) MUST be reported
  on the Weather tab. Unlike QRZ's ambient auto-lookup (`QRZ-030`), fetching
  alerts is an explicit, on-demand operator action, so surfacing the failure
  is correct here rather than staying silent.
- **NWSA-013:** Opening the alerts section is the operator's request to
  fetch: it MUST fetch at once, with no second click. Once open, the section
  MUST offer a Refresh that fetches again and MUST say when alerts were last
  fetched. Hiding and reopening fetches again. Nothing fetches while the
  section is closed or in the background.

## Current forecast

A textual forecast for the same area of interest, alongside alerts and
radar — during a SKYWARN activation, knowing what's currently forecast for
the coverage area is as relevant as active warnings.

- **NWSA-020:** The Weather tab MUST offer fetching the current NWS
  forecast (today/tonight and upcoming periods) for the configured area of
  interest, reusing its coordinates (`NWSA-004`) rather than a separately
  entered location.
- **NWSA-021:** Unlike alerts (`NWSA-005`), a forecast has no unscoped
  fallback — it is inherently tied to a point. When no area of interest is
  set, the Weather tab MUST say so plainly rather than offering a forecast
  fetch that cannot succeed.
- **NWSA-022:** Fetching the forecast MUST be an explicit, on-demand
  operator action (mirrors `NWSA-012`'s treatment of alerts), not automatic
  or backgrounded. Opening the forecast section is that action, with the same
  fetch-on-open, Refresh, and last-fetched behavior as alerts (`NWSA-013`).
- **NWSA-023:** A failed forecast fetch (offline, NWS outage, no area set)
  MUST be reported clearly on the Weather tab rather than failing silently.

## Explicit non-goals for this slice

- Multiple simultaneous coverage areas (e.g. a club's multi-county
  territory) — deferred; this slice supports one configured area at a time.
- Automatic or background periodic re-fetching of alerts — fetching remains
  an explicit operator action.
- Displaying the configured area on a map — the check-in location map
  (`CIMAP`) is a separate, unrelated view and this slice does not connect to
  it.
- Direct entry of a raw NWS zone/county UGC code as an alternate input. The
  free-text-plus-geocoding path covers the stated need; UGC entry can be
  added later as an additional option without changing this design.
- Linking the weather area of interest to a specific activity (e.g.
  overriding it per-SKYWARN-activation the way check-in location does,
  `CIMAP-060`) — today it is a single, global application setting shared by
  alerts, forecast, and radar alike. Worth revisiting if activities need
  their own distinct coverage areas.

## Acceptance examples

```gherkin
Scenario: Configuring an area by zip code scopes alerts
  Given the operator enters "79936" as their weather area of interest
  When it resolves successfully
  And the operator fetches NWS alerts
  Then only alerts affecting that resolved location are returned

Scenario: Area configured by city name when zip code is unknown
  Given the operator does not know their zip code
  When they enter "El Paso, TX" as their weather area of interest
  Then it resolves to coordinates the same way a zip code would
  And subsequent alert fetches are scoped to that location

Scenario: Clearing the area reverts to unscoped fetching
  Given a weather area of interest is configured
  When the operator clears it
  Then subsequent alert fetches return all active alerts nationwide, as before

Scenario: Fetching still works without an NWS API key
  Given no NWS API key is configured
  And a weather area of interest is configured
  When the operator fetches alerts
  Then alerts scoped to that area are returned normally

Scenario: No match is reported, not silently accepted
  Given the operator enters unresolvable text as the area
  When resolution fails
  Then the operator sees a clear failure message
  And the previously configured area (if any) remains unchanged
```
