# Feature: Mile-Marker Lookup

## Status

Draft — implemented for Florida (Turnpike, I-95, I-75, US-1 in the Keys, US-41 Tamiami Trail).

## Purpose

Mobile stations often report where they are as "mile marker 182 on the
turnpike." Turning that into a point on the map, and a distance from the
net's location, has to work with no internet — the situations where it
matters are the ones where connectivity is worst.

## Relationship to other documents

- A location source within [location-resolution.md](location-resolution.md);
  results are stored as ordinary coordinates on the check-in (`LOCRES-*`).
- Governed by the offline-first boundary in
  [02-scope-and-release-boundaries.md](../02-scope-and-release-boundaries.md).
- Road data is updated from a public source by the operator on demand, in the
  same Settings area as [offline-callsign-directory.md](offline-callsign-directory.md).

## Data model

- **MILE-001:** Each road MUST be a self-contained *road pack*: an id, a
  display name, a list of aliases the road may be called ("turnpike", "I-95",
  "95"), a source credit, a generated-at timestamp, and an ordered list of
  anchors, one per mile marker (`mile`, `lat`, `lon`).
- **MILE-002:** Positions between anchors MUST be interpolated linearly.
  A mile marker outside a road's covered range MUST NOT resolve.
- **MILE-003:** Road packs MUST be small (a few kilobytes each) and stored
  as plain files, so they are cheap to ship, update, and inspect.
- **MILE-004:** A bundled copy of each road MUST ship with the application so
  the feature works on first run with no download. A downloaded copy, when
  present, MUST take precedence over the bundled one.

## Understanding what the operator typed

- **MILE-010:** Resolution MUST run entirely offline on already-loaded data.
- **MILE-011:** The parser MUST accept natural phrasings, including
  "mile marker 182 on turnpike", "MM 182 I-95", "milepost 45 i75", and
  "I-95 exit 12", and MUST treat "i95" and "mm182" the same as "i 95" and
  "mm 182". Decimal miles ("182.5") MUST be accepted.
- **MILE-012:** Exit numbers MUST be treated as mile numbers, since Florida
  exits are numbered by mile.
- **MILE-013:** The road MUST be chosen by its longest matching alias. A bare
  number alias ("95") MUST count only when it is all that remains of the text,
  so a stray number elsewhere in the sentence cannot select a road.
- **MILE-014:** Text that is not a mile-marker reference, names no road with
  data, or falls outside the road's range MUST resolve to nothing, and the
  caller MUST fall back to its normal behavior.

## Where it is used

- **MILE-020:** The check-in Coordinates field MUST accept a mile-marker
  phrase in place of coordinates and show the resolved point and label
  before saving.
- **MILE-021:** The location picker's search MUST try mile-marker resolution
  first, before any online address search.
- **MILE-022:** A resolved point MUST be labeled with the road and mile
  (for example "I-95 MM 180") and MUST be treated as an estimate the operator
  can move.

## Updating road data

Roads are updated from the Florida Department of Transportation's public
ArcGIS feature services (posted mile-marker sign locations, and state-road
mile markers used to fill I-95 where the sign inventory has gaps). The data
is downloaded directly from the source by the operator's copy of the
application; it is not hosted or redistributed by this project.

- **MILE-030:** Settings MUST offer to update each road, and all roads at
  once, with the date each was last updated shown. Bundled copies MUST be
  labeled as such.
- **MILE-031:** Updating MUST be an explicit online action and MUST fail
  fast and clearly when offline. Requests MUST have hard timeouts so the
  interface can never sit on "Updating…".
- **MILE-032:** When a road has several sources, the first is primary and
  later sources MUST only fill mile ranges the earlier ones do not cover.
- **MILE-033:** A downloaded pack MUST be validated before it replaces
  existing data. It MUST be refused, keeping what the operator has, when it
  is empty or malformed, covers markedly less of the road than the current
  copy (under 80% of its mileage span), or disagrees with the current copy
  by more than about four miles at the same mile markers (a sign the
  provider changed its numbering).
- **MILE-034:** Installing an update MUST be atomic: an interrupted save
  MUST NOT leave a partial file.
- **MILE-035:** The interface MUST credit the data source.

## Non-goals

- Roads outside Florida, until additional sources are validated.
- Turn-by-turn or routing behavior; this only places a point.

## Acceptance examples

```gherkin
Scenario: Resolving a phrase offline
  Given no internet connection
  When the operator types "mile marker 182 on turnpike" in the check-in Coordinates field
  Then a map point and the label "Florida's Turnpike MM 182" are shown
  And saving stores the point on the check-in

Scenario: A bad download is refused
  Given a road pack the operator has been using
  When an update downloads data covering a quarter of the road
  Then the update is refused with an explanation
  And the existing road data is unchanged
```
