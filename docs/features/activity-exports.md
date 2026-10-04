# Feature: Activity Exports

## Status

Draft — implemented.

## Purpose

An activity's records are useful outside the application: for a served agency,
a report, another system, or an archive. Every way of getting them out should
be in one predictable place, complete, and unambiguous about time.

## Relationship to other documents

- Collects the exports defined in [weekly-net-operations.md](weekly-net-operations.md)
  (`NETOPS-046`, `NETOPS-048`), [skywarn-incidents-and-reports.md](skywarn-incidents-and-reports.md)
  (`SPOT-050`–`055`), [activity-lifecycle-and-wrap-up.md](activity-lifecycle-and-wrap-up.md)
  (`LIFE-033`), and the forms in [ics-form-exports.md](ics-form-exports.md).
- Serves the output capability in
  [02-scope-and-release-boundaries.md](../02-scope-and-release-boundaries.md).
- Whole-database backup is separate ([database-backup-restore.md](database-backup-restore.md)):
  a backup protects everything in the application; an export describes one activity.

## One home

- **EXPORT-001:** The application MUST have an **Exports** tab that offers every
  export for the activity focused in the header, and the tab MUST make clear which
  activity that is and its state.
- **EXPORT-002:** No other tab MUST carry its own export menu. The Check-ins and
  Spotter Reports tabs MAY offer a link to the Exports tab, and per-record actions
  (for example the ICS 213 for one spotter report) MAY remain where the record is.
- **EXPORT-003:** The end-of-net step MUST offer the same list, from the same
  component, so the two cannot differ (`LIFE-033`).
- **EXPORT-004:** Exports MUST be available for a closed activity (`LIFE-010`)
  and MUST NOT change any record.
- **EXPORT-005:** Every export MUST run offline and be written where the operator
  chooses (`NETOPS-048`), and MUST report where it was saved or why it failed.
- **EXPORT-006:** Each export MUST show how many records it covers. When there
  are none, the export MUST NOT produce an empty file; it MUST look unavailable
  and, when the operator clicks it, MUST say why nothing was exported (for example
  "there are no check-ins yet"). A disabled control that gives no reason is not
  enough.
- **EXPORT-007:** The suggested name for a saved export MUST be readable and
  identify the activity, when it happened, and what the file holds, in the form
  `<title> - <YYYY-MM-DD HHMM> - <kind>.<ext>` (for example
  `Tuesday Net - 2026-09-21 1904 - Check-ins.csv`). The date and time MUST be local:
  when the activity was started, or its scheduled time if it has not been, and
  left out if it has neither. Characters not allowed in Windows or Linux
  filenames MUST be removed from the title. Files whose names Winlink Express
  requires (`ICSF-012`, `ICSF-013`) keep those exact names.
- **EXPORT-008:** A saved export MUST carry its file type's extension. The save
  dialog MUST offer that file type, and if the operator's chosen name lacks the
  extension, it MUST be added.

## What can be exported

- **EXPORT-010:** Check-ins as CSV, holding everything the roster shows:
  call sign, name, location, grid square, address, coordinates and location label,
  traffic and whether it was handled, and the check-in time.
- **EXPORT-011:** Spotter reports as CSV and a readable text report, each
  viewable before saving (`EXPORT-017`, `EXPORT-018`).
- **EXPORT-012:** *(Retired.)* There is no separate activity log; what happened
  during an activity is recorded on its check-ins, traffic, spotter reports, and
  closing notes, and in its history.
- **EXPORT-013:** The full history as CSV: every start, close, correction, removal,
  restore, and traffic-handled mark, for the activity and for its
  check-ins and spotter reports, each with the operator (`AUDIT-001`).
- **EXPORT-014:** The activity summary as text, using the sections its type
  emphasises (`LIFE-054`).
- **EXPORT-017:** The summary MUST be readable without saving a file, laid
  out like the end-of-net step: on the Operations tab for the selected
  activity, folded to a line of counts that opens with a click, and for each
  archived activity without restoring it. The summary is saved from the
  export list, where the exact text it saves as (`EXPORT-014`) MUST be
  viewable first ("Show summary text"), with Copy and Save.
- **EXPORT-018:** Each CSV export (check-ins, spotter reports, full history)
  MUST be viewable before saving ("Show CSV"): as a table read back from the
  exact text that would be saved, with its row and column counts, the raw text
  on request, and Copy and Save of that text.
- **EXPORT-015:** *(Retired.)* There are no JSON exports — not of check-ins,
  spotter reports, or the whole activity as one package. The people using the
  app work with spreadsheets and readable text; JSON can be added back if a
  need for it appears. A database backup ([database-backup-restore.md](database-backup-restore.md))
  keeps everything.
- **EXPORT-016:** The ICS 309 (from the check-ins) and ICS 213 (from spotter
  reports, all or one) as Winlink import data and as printable forms
  ([ics-form-exports.md](ics-form-exports.md)).

## Time

- **EXPORT-020:** Every time in a CSV or text export MUST be given both as
  local time and as UTC (`TIME-002`, `TIME-003`). A time recorded without a zone
  (a spotter report's observed time) MUST be read as local time for the UTC value.
- **EXPORT-021:** UTC times MUST be written in a fixed, sortable form
  (`YYYY-MM-DDTHH:MM:SSZ`).

## Acceptance examples

```gherkin
Scenario: Everything in one place
  Given a focused activity with check-ins and reports
  When the operator opens the Exports tab
  Then each kind of record is listed with its count and formats

Scenario: Nothing to export
  Given an activity with no check-ins
  When the operator clicks the ICS 309 option
  Then a message says the form is built from check-ins and there are none yet

Scenario: Exporting after the net ends
  Given a closed activity
  When the operator saves the check-in CSV
  Then the file is written and nothing about the activity changes

Scenario: Unambiguous times
  Given a spotter report observed at 19:07 local time
  When the reports are exported as CSV
  Then the row has both the local time and the UTC time
```
