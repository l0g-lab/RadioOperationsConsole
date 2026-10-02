# Feature: Activity Lifecycle and Net Wrap-Up

## Status

Draft — first slice implemented: `scheduled → active → closed`, and reopening.
The `draft` and `suspended` states of the full lifecycle in
[05-event-and-template-model.md](../05-event-and-template-model.md), opening
and closing scripts, and closeout checklists are not built yet.

## Purpose

A net has a beginning and an end. Recording when it started and ended, being
told what is still open when it ends, saving the records, and writing a short
conclusion turns a pile of check-ins into a finished, reportable activity —
and stops later edits from quietly changing a net that is over.

## Relationship to other documents

- Implements the lifecycle rules `EVENT-001`, `EVENT-002`, `EVENT-004`, and
  the closed-activity rule `AUDIT-004`, and the activity time fields in
  [07-time-audit-and-record-history.md](../07-time-audit-and-record-history.md)
  (opened, closed).
- Extends the activity handling in [weekly-net-operations.md](weekly-net-operations.md)
  and the header in [06-application-shell-and-navigation.md](../06-application-shell-and-navigation.md).
- Exports reuse those in [weekly-net-operations.md](weekly-net-operations.md)
  (`NETOPS-046`–`048`).

## States and transitions

- **LIFE-001:** An activity MUST be in exactly one of three states:
  `scheduled` (not started), `active` (open), or `closed`. Activities that
  existed before this feature are `active`; new activities start as
  `scheduled`.
- **LIFE-002:** Only these transitions MUST be accepted: `scheduled → active`
  (start), `active → closed` (end), and `closed → active` (reopen). Anything
  else MUST be refused with a readable message (`EVENT-001`).
- **LIFE-003:** Every transition MUST create an audit event recording the
  prior and new state, the reason when given, the acting operator, and the
  time both as UTC and as the local clock read (`EVENT-002`).
- **LIFE-004:** Reopening MUST require a non-empty reason (`EVENT-004`).
- **LIFE-005:** The activity MUST record when it was first started and when
  it was last closed (UTC). Reopening clears the closed time; the earlier
  close and its time remain in the audit trail. Closing notes are kept
  across a reopen.
- **LIFE-006:** A `scheduled` activity MUST accept records. Starting the net
  records the time; it does not gate logging, so a forgotten Start never
  blocks a check-in.
- **LIFE-007:** Archiving remains separate from closing (`EVENT-005`); an
  activity MAY be archived when it is closed, from the close-out step.

## Closed activities are read-only

- **LIFE-010:** While an activity is closed, the application MUST refuse to
  add or change its check-ins (including their traffic), spotter reports,
  including removing and restoring them (`AUDIT-004`). This MUST be
  enforced by the backend, not only hidden in the interface.
- **LIFE-011:** In the interface, entry forms and edit/remove actions for a
  closed activity MUST be replaced or hidden, with a visible banner saying
  the activity is closed and how to reopen it. Existing records MUST stay
  viewable and exportable.
- **LIFE-012:** Activity details (title, date, frequency, location) MAY still
  be corrected on a closed activity.

## Controls

- **LIFE-020:** The header MUST show the focused activity's state as text (not
  color alone) and offer the one action that applies: **Start net**,
  **End net…**, or **Reopen…** (`UX-OPS-007`).
- **LIFE-021:** Closed activities MUST be marked as closed in the activity
  selector.

## Wrapping up a net

- **LIFE-030:** **End net…** MUST open a close-out step showing a summary —
  check-ins and unique stations, check-ins with traffic, spotter
  reports, and how long the net was open.
- **LIFE-031:** The step MUST warn about check-ins with traffic not yet marked
  as handled (`NETOPS-050`–`056`). The warning MUST NOT prevent ending the net (`EVENT-003`). Other
  unresolved items named in `EVENT-003` (reports needing disposition,
  incomplete assignments) will be added as those concepts are built.
- **LIFE-032:** The step MUST let the operator write an optional conclusion,
  which is saved with the activity.
- **LIFE-033:** The step MUST let the operator save the check-in list (CSV),
  the ICS 309 log, the spotter reports (CSV) and their ICS 213 when there are
  any, and a plain-text net summary before ending, all offline
  ([ics-form-exports.md](ics-form-exports.md)).
- **LIFE-034:** The step MUST offer to archive the activity when it ends.
- **LIFE-035:** Ending MUST be one explicit action; cancelling MUST change
  nothing.

## Summary

- **LIFE-040:** The Operations tab MUST show, for the selected activity, its
  state, start and end times (local and UTC, `TIME-003`), duration, the
  counts in `LIFE-030`, and the conclusion when there is one.
- **LIFE-041:** The summary MUST be savable as plain text.
- **LIFE-042:** A station checked in more than once MUST be counted once in
  "unique stations", without regard to letter case; removed check-ins MUST
  NOT count.

## Activity types

An activity has a type. The type decides which parts of the summary are shown
by default; it does not restrict what records an activity can hold
(`05-event-and-template-model.md`, "An activity type supplies defaults").

- **LIFE-050:** Every activity MUST have a type. The initial types are
  **Simple net** (check-ins), **Directed net** (check-ins, traffic),
  **SKYWARN** (check-ins, spotter reports by hazard, traffic), and **Other**
  (everything). New activities default to Directed
  net; activities that existed before types were added became Directed net.
- **LIFE-051:** The type MUST be chosen when creating an activity and MUST be
  editable afterward, with the change recorded as a correction (`AUDIT-002`).
- **LIFE-052:** Types MUST be defined in one place in the application so that
  adding one requires no database change. The database MUST store the type as
  plain text, and a stored type the application does not recognise MUST still
  display, by name, and be treated as **Other**.
- **LIFE-053:** The focused activity's type MUST be shown in the header
  (`UX-OPS-008`).
- **LIFE-054:** The summary, the end-of-net step, and the saved text summary
  MUST show the sections the type emphasises, and MUST also show any other
  section that has records. Changing the type MUST NOT hide data that exists.
- **LIFE-055:** The SKYWARN summary MUST break spotter reports down by hazard
  type.
- **LIFE-056:** The summary, the end-of-net step, and the saved text MUST agree
  on which counts they show for a given activity.

Not built: the ARES/RACES and SET-exercise types (they need assignments,
injects, and real-versus-simulated marking to differ meaningfully), and
type-driven tab visibility (`TEMPLATE-005`, `TEMPLATE-006`).

## Not yet built

- `draft` and `suspended` states.
- Opening and closing scripts (planned with net listings), and a closeout
  checklist supplied by the activity type.
- Guarding location changes on closed check-ins.

## Acceptance examples

```gherkin
Scenario: The summary follows the type
  Given a simple net with check-ins only
  When its summary is shown
  Then only check-ins are listed

Scenario: A type never hides data
  Given a simple net that has a spotter report
  When its summary is shown
  Then the spotter report is counted too

Scenario: Running and ending a net
  Given a new activity in the scheduled state
  When the operator starts it, logs check-ins, and ends it with a conclusion
  Then the activity is closed with start and end times recorded
  And the history shows started and closed events with the operator and both times

Scenario: A closed net is protected
  Given a closed activity
  When anything tries to add a check-in to it
  Then it is refused and nothing is saved

Scenario: Reopening needs a reason
  Given a closed activity
  When the operator reopens it without a reason
  Then it stays closed and asks for a reason

Scenario: Open traffic is flagged, not blocking
  Given two check-ins with traffic, one marked handled
  When the operator opens the End net step
  Then it warns that one item is not marked handled
  And the operator can still end the net
```
