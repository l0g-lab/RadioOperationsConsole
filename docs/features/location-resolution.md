# Feature: Location Resolution and Coordinates

## Status

Draft — implemented. Supersedes the coordinate-resolution rules in
[checkin-location-map.md](checkin-location-map.md) (`CIMAP-010`–`CIMAP-015`),
which described geocoding-first plotting from grid squares and text.

## Purpose

Locations arrive in many forms — a ZIP code, a grid square, an address, GPS
coordinates, "mile marker 182 on the turnpike." Coordinates are what maps and
distances need; addresses are what people read. This document defines one
offline-first way to turn any of them into a point, and how that point is
stored, shown, and typed, so every feature agrees.

## Relationship to other documents

- Applies to check-ins ([checkin-location-map.md](checkin-location-map.md)),
  spotter reports ([skywarn-incidents-and-reports.md](skywarn-incidents-and-reports.md)),
  activities, operators, the weather area ([nws-alerts.md](nws-alerts.md)),
  and the APRS-IS area ([aprs-is-live-feed.md](aprs-is-live-feed.md)).
- Feeds in [mile-marker-lookup.md](mile-marker-lookup.md) and
  [offline-callsign-directory.md](offline-callsign-directory.md).
- Governed by the offline-first and online-add-on boundaries in
  [02-scope-and-release-boundaries.md](../02-scope-and-release-boundaries.md).

## Resolution order

- **LOCRES-001:** The application MUST use one shared resolver, in this order,
  taking the first that produces a point:
  1. coordinates already known (typed, or a pin the operator placed);
  2. the exact point QRZ holds for the station, when QRZ's own position came
     from a geocode or the station's own entry rather than a rounded grid
     square or ZIP;
  3. the centroid of a ZIP code found in the address or QTH text, from a
     table bundled with the application;
  4. the center of a grid square, by Maidenhead math.
- **LOCRES-002:** The shared resolver MUST NOT make network requests. Online
  geocoding is a separate, explicit add-on the caller chooses to attempt when
  the resolver finds nothing.
- **LOCRES-003:** Each resolved point SHOULD carry how it was derived (typed,
  QRZ, ZIP, grid) so the interface can present estimates as estimates.
- **LOCRES-004:** The bundled ZIP table MUST load lazily and be cached after
  first use.

## Stored coordinates

- **LOCRES-010:** A check-in's coordinates and location label MUST be
  resolved and stored when the check-in is saved, and the map and roster MUST
  use the stored values rather than re-deriving them on every view. A
  check-in with no stored point is left off the map.
- **LOCRES-011:** The operator MUST be able to set, change, or clear a
  check-in's point afterward with the map picker. The change MUST apply only
  when the operator confirms with "Save location," never on a map click.
- **LOCRES-012:** Moving a pin MUST clear the label describing the previous
  point, so a label never describes a place the pin has left.
- **LOCRES-013:** The check-in entry form MUST show the coordinates and where
  they came from as the call sign is looked up, and the roster MUST show a
  coordinates column.
- **LOCRES-014:** A Coordinates field on check-in entry MUST accept
  coordinates in any supported format (`LOCRES-030`) or a mile-marker phrase
  (`MILE-020`), and explain how a value it filled in came to be there.

## Reference points and distances

- **LOCRES-020:** An activity MAY have its own location; a new activity
  without one MUST default to the acting operator's location
  (`ACTTPL-041`).
- **LOCRES-021:** Where a reference point is needed (for example, distance
  from the net to a check-in), the activity's location MUST take precedence
  over the operator's.

## Coordinate formats

- **LOCRES-030:** The application MUST support three formats, both for
  display and for entry:
  - decimal degrees (`39.73915, -104.99030`);
  - degrees and decimal minutes (`39°44.349′N, 104°59.418′W`);
  - degrees, minutes, and seconds (`39°44′20.9″N, 104°59′25.1″W`).
- **LOCRES-031:** Entry MUST accept any of the three regardless of the
  display setting. Hemisphere letters MAY lead or trail, the ° ′ ″ symbols
  are optional, and a leading minus MUST still mean south or west. Latitude
  and longitude MAY be swapped if their hemisphere letters make the order
  unambiguous.
- **LOCRES-032:** Values out of range (latitude beyond 90°, longitude beyond
  180°, minutes or seconds of 60 or more) MUST be rejected with a message
  that lists the accepted formats.
- **LOCRES-033:** The display format is a preference
  ([display-preferences.md](display-preferences.md)) and MUST apply to every
  place coordinates are shown.
- **LOCRES-034:** Formatting then parsing a value MUST return the same point,
  to the precision shown.

## Areas of interest

- **LOCRES-040:** The weather area and the APRS-IS area MUST each offer the
  same map picker used elsewhere, in addition to text entry.
- **LOCRES-041:** The APRS-IS area last used SHOULD be remembered across tab
  switches.

## Acceptance examples

```gherkin
Scenario: QRZ's exact point beats a ZIP
  Given QRZ has an exact point for a station and the address contains a ZIP
  When the station is checked in
  Then the stored point is QRZ's exact point

Scenario: Falling back with no QRZ
  Given no QRZ point and an address with a ZIP
  When the station is checked in
  Then the stored point is the ZIP centroid, shown as an estimate

Scenario: Typing coordinates in another format
  Given the display format is decimal degrees
  When the operator types "39°44′20.9″N 104°59′25.1″W"
  Then it is accepted as the same point as 39.73914, -104.99030
```
