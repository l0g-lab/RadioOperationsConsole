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

- **LOCRES-001:** The application MUST use one shared resolver
  (`LOCRES-060`), in this order, taking the first that produces a point:
  1. a spot picked on the map;
  2. typed coordinates, in any of the formats of `LOCRES-030`;
  3. a grid square typed on its own (its centre, approximate);
  4. a mile marker, from the offline road data;
  5. a saved place, typed by its name (`PLACE-001`), ignoring case;
  6. the exact point QRZ holds for the station, when QRZ's own position came
     from a geocode or the station's own entry rather than a rounded grid
     square or ZIP;
  7. a place already looked up online, remembered (`LOCRES-055`), which
     works offline;
  8. where someone is waiting for the answer (a search box), the online
     lookup (`LOCRES-051`–`LOCRES-054`);
  9. the centroid of a ZIP code found in the text, from a table bundled
     with the application, else the centre of the station's grid square
     (approximate).
  A spot picked on the map, typed coordinates, a mile marker, and a saved
  place are placed by hand (`CIMAP-003`).
- **LOCRES-002:** Where something is being saved (a check-in, a spotter
  report), the resolver MUST NOT make network requests: it places what it
  can offline, and the online lookup runs after saving for what it couldn't
  place exactly (`LOCRES-050`).
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

- **LOCRES-020:** An activity MAY have its own location, which is where net
  control is; a new activity without one MUST default to the acting
  operator's location, copied onto the activity when it is created. Failing
  to apply it MUST NOT prevent the activity from being created. A repeater is
  kept separately ([repeater-directory.md](repeater-directory.md)).
- **LOCRES-021:** Where net control's position is needed, the activity's
  location MUST take precedence over the operator's. Distances to check-ins
  are measured from the activity's repeater when it has one, else from net
  control (`RPT-031`).

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

## Looking places up online

Typed locations (an address, a town, a cross street such as "sw 152st & sw
137ave miami fl") that can't be placed exactly offline are looked up online.
The free map services this uses are shared, so the lookup asks as little of
them as it can.

- **LOCRES-050:** A check-in's or spotter report's typed location that isn't
  placed exactly offline (by a pin, coordinates, a mile marker, a typed grid
  square, or QRZ's exact point) MUST be looked up online after it's saved,
  never before: saving MUST NOT wait on the internet. Until then it keeps
  any offline estimate (a ZIP centre). When found, it MUST be placed and the
  roster or reports list refreshed, unless meanwhile it was placed by hand
  or its location was changed. A grid square from a call-sign lookup stays;
  one worked out from the old point follows the new one. Nothing is looked
  up offline, or while typing.
- **LOCRES-051:** Shorthand MUST be read as map data names streets:
  directions ("sw" → Southwest), street types ("st", "ave", "rd", "ter", and
  so on), and a number before a street type as an ordinal ("152 st",
  "152st" → 152nd Street). A house number or highway number ("US 1") stays a
  number.
- **LOCRES-052:** Two streets joined by "&", "and", "@", "at", or "/" are a
  cross street, with an optional town after the second (after a comma, or
  after its street type). It MUST be placed where the streets cross: from
  the two streets' shapes, worked out on this computer, looking again
  closer to where the streets look likely to meet when a long street's
  crossing piece didn't come back; then, if that finds nothing, by asking
  Overpass; then by a plain search. Street names match whichever way map
  data spells them, including alternate names ("Douglas Road" for
  "Southwest 37th Avenue").
- **LOCRES-053:** Searches MUST stay near the net first: within 40 km of its
  repeater, else net control, or of a typed town; then anywhere in the US.
  Without a town or a net location a cross street isn't searched for, since
  a street name alone matches across the country.
- **LOCRES-054:** A found place MUST say how exact it is: an address or a
  cross street is exact; somewhere along a street, a town's centre, or an
  area's centre is approximate, and its map label MUST say so.
- **LOCRES-055:** The lookup MUST ask Nominatim at most once a second, and
  remember what it found until cleared in Settings → Storage ("Looked-up
  places"), so the same address or corner is asked once. A place not found
  MUST be remembered for a day, and nothing when a service failed to answer
  (it's asked again next time).
- **LOCRES-056:** Reading what's typed, matching street names, and working
  out where streets cross MUST NOT need the network, so downloaded street
  data can use them offline later.

## One resolver everywhere

- **LOCRES-060:** Every place in the application where a location is typed
  or looked up MUST place it through the one resolver of `LOCRES-001`, so
  the same text lands in the same place wherever it's entered: the check-in
  and spotter report Location boxes and their edit rows, a call-sign lookup
  filling in a station, a new operator's location from their call sign, the
  map picker's search (`CIMAP-073`: net control, operators, repeaters,
  saved places, the APRS-IS area, a check-in's or report's spot), and the
  weather area. Screens MUST NOT look places up by any other path.
- **LOCRES-061:** The map picker's search MUST accept everything a Location
  box does (coordinates, a grid square, a mile marker, a saved place's
  name, an address, a town, a cross street), look near the net when it's
  opened for one, and say when the pin is only roughly placed.

- **LOCRES-062:** QRZ's point for a station can be old (a past address
  still set on QRZ) or rough, so a street address with a house number that
  matches a house MUST win over it. Where someone is waiting, the address
  is looked up first; when saving, the station is placed at QRZ's point at
  once and moved after saving only if the address matches a house or a
  corner, never to a vaguer street or town. Without a house number (a town
  alone), QRZ's point stands.

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
