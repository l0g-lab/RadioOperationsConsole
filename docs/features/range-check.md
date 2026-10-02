# Feature: Range Check

## Status

Draft — implemented.

## Purpose

While working on a repeater, the group asks stations around the city to
check in so it can learn how far the repeater reaches and where it falls
off. Each check-in is only useful with an exact place, how well each side
hears the other, and what the station is running. A range check is an
activity type for that, and it does not accept a check-in that is missing
any of it.

## Relationship to other documents

- An activity type alongside those in
  [activity-lifecycle-and-wrap-up.md](activity-lifecycle-and-wrap-up.md)
  (`LIFE-050`–`056`) and [station-log.md](station-log.md). A range check is
  run as a net: it is started and ended like one (`LIFE-001`–`007`).
- Its check-ins are ordinary check-in records (`PRINCIPLE-002`) with extra
  fields, so call-sign fill-in, removal and restore, history, backup, and
  exports apply unchanged.
- The repeater is the activity's repeater
  ([repeater-directory.md](repeater-directory.md), `RPT-021`–`023`), kept
  apart from the activity's own location, which is net control's. Distances
  are measured from the repeater (`RPT-031`).

## The type

- **RANGE-001:** There MUST be a "Range check" activity type, selectable
  wherever a type is chosen. It is a net: it has a date, a time, Start and
  End.
- **RANGE-002:** A range check MUST have the repeater's location. Creating
  one MUST require a location to be chosen; the operator's own location MUST
  NOT stand in for it. Changing an activity to a range check MUST be refused
  while it has no location, and a range check's location MUST NOT be
  cleared, only moved. Check-ins MUST be refused while a range check has no
  location (for example, one created when setting the location failed).
- **RANGE-003:** Wherever the activity's location is shown or set for a range
  check, it MUST be called the repeater location.

## Check-ins

- **RANGE-010:** A range-check check-in MUST record, besides the call sign and
  name: the cross street the station gives, its exact point on the map, the
  station type (Mobile, Base or HT), power, how net control hears the
  station, and how the station hears the repeater. Antenna MUST be recorded
  for a base station. Notes MAY be added.
- **RANGE-011:** Saving MUST be refused while any of those is missing, saying
  which ones, with each missing field marked. Nothing typed is lost. The
  backend MUST refuse the same check-in.
- **RANGE-012:** The antenna field MUST appear only when the station type is
  Base. A check-in saved as Mobile or HT MUST be stored with no antenna.
- **RANGE-013:** Both signal reports MUST be chosen from a list of five, best
  to worst: Full quieting, Slight noise, Noisy but readable, Broken,
  Unreadable. No report is chosen until the operator chooses one. The
  backend MUST refuse any other value.
- **RANGE-014:** The station's point MUST be set only by clicking a map. It
  MUST NOT be typed as coordinates or worked out from an address, grid
  square, ZIP code, or call-sign lookup. The map opens on the point already
  chosen, or else on the repeater. A place search MAY move the map, but MUST
  NOT place the point. The cross street is the point's label.
- **RANGE-015:** The QTH, grid, address, coordinates, and traffic entries MUST
  NOT be offered for a range check. A call-sign lookup still fills in the
  name.
- **RANGE-016:** After a check-in is saved, every range-check field MUST start
  blank for the next station.
- **RANGE-017:** Correcting a check-in MUST meet the same requirements, and
  its point is still moved only on the map. The change MUST be recorded in
  the audit trail with the station type and cross street before and after
  (`LOG-016`).

## The roster and map

- **RANGE-020:** The roster MUST show each check-in's call sign, name, cross
  street, distance from the repeater, station type, antenna, power, both
  signal reports, notes, and time.
- **RANGE-021:** The check-in map MUST mark the repeater as "Repeater" and
  color each station by how net control hears it, with a legend. A station's
  popup MUST show both signal reports, its station type, and its power.
- **RANGE-022:** Roster exports (CSV and JSON) MUST include the station type
  and cross street.

## Not yet built

- Comparing range checks over time (before and after an antenna change).
- Coverage shading between reports.

## Acceptance examples

- Given a range check whose repeater location is set
  When the operator enters KD4ABC, cross street "Colonial & Mills", picks the
  point on the map, chooses Mobile, 50 W, "Full quieting" and "Slight noise"
  Then the check-in saves and the form starts blank for the next station.

- Given the same entry with Base chosen and no antenna
  When the operator saves
  Then the save is refused, saying antenna is still needed, and nothing typed
  is lost.

- Given an operator creating a range check without choosing a location
  Then Create is unavailable until the repeater location is set.
