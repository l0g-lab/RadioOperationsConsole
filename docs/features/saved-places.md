# Feature: Saved Places

## Status

Draft — implemented.

## Purpose

Net control often operates from the same few spots: home, a friend's QTH, the
club headquarters or county EOC. Saved places keep those once, so setting a
location is a pick from a list instead of finding the spot on the map again,
often in a hurry.

## Relationship to other documents

- Picked in the shared map location picker (`CIMAP-073`), so a place can set
  any location the picker sets: an activity's net control location
  (`LOCRES-020`), an operator's location, a repeater placed by hand
  (`RPT-023`), a check-in, or a spotter report.
- Not offered where a point must be clicked on the map (a range-check
  station, `RANGE-014`).
- The operator's own location stays on the operator, and a new activity still
  defaults to it (`LOCRES-020`). Net listings don't remember a location.
- Included in database backups ([database-backup-restore.md](database-backup-restore.md)).

## Requirements

- **PLACE-001:** A place MUST have a name and a point, and MAY have notes
  ("generator on site").
- **PLACE-010:** Places MUST be listed by name on the Operations tab, where
  they can be added, edited (including moved on the map), and deleted after
  confirmation. Changes are recorded in the history (`AUDIT-001`), which
  keeps showing a deleted place's name.
- **PLACE-011:** A location set from a place is a copy: editing or deleting
  the place MUST NOT change any activity, operator, or record.
- **PLACE-020:** The map location picker MUST list saved places when there
  are any; choosing one drops the pin there, with the place's name as the
  label and its notes shown, and the pin can still be moved before saving.
- **PLACE-021:** The picker MUST offer to save the pinned spot as a new place,
  asking for its name.
