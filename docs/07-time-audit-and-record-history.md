# Time, Audit, and Record History

## Time model

Every operational record distinguishes when something occurred from when it was entered.

Canonical time is stored in UTC. The application also retains the activity timezone identifier and the UTC offset applicable to the represented local time.

## Required time fields

| Record | Required times |
| --- | --- |
| Activity | created, opened, closed; suspended/resumed when used |
| Check-in | checked in, entered; checked out when used |
| Activity entry | occurred, entered |
| Spotter report | observed, received, entered; forwarded when used. **Partially implemented** — spotter reports currently store one operator-editable event time (`reported_at`) and an entry time (`created_at`); a separate "received" time and a "forwarded to NWS" time are not yet distinct fields. |
| Traffic item | created/received, entered; sent, delivered, acknowledged when used |
| Assignment | created; due and completed when used |
| External alert | sent/effective/expires from source; retrieved locally |
| APRS reception | received locally when heard; **not persisted** — this is a live APRS-IS feed by design, not an artifact of a terms-of-use restriction; packets live only in memory for the current feed session (see `aprs-is-live-feed.md`'s non-goals). |
| Generated artifact | generated from immutable snapshot |

## Requirements

- **TIME-001:** The PC clock MUST provide the default current time.
- **TIME-002:** Every operational timestamp MUST have an unambiguous UTC representation.
- **TIME-003:** The UI MUST display both local and UTC time on live operational records and in the persistent header.
- **TIME-004:** Default live display SHOULD use 24-hour time including seconds.
- **TIME-005:** Operators MUST be able to adjust an occurrence, observation, or received time when information refers to an earlier event.
- **TIME-006:** Editing an operational time MUST NOT change the original entered time.
- **TIME-007:** The system MUST handle daylight-saving transitions without creating ambiguous stored timestamps.
- **TIME-008:** A significant detected PC-clock jump during an active activity MUST create a visible warning and system activity entry.
- **TIME-009:** Source timestamps from NWS, APRS, QRZ, radar, or geocoding MUST remain distinguishable from local retrieval times.

## Record revisions

- **AUDIT-001:** Creating, correcting, archiving, restoring, linking, unlinking, or changing status on an operational record MUST create an audit event.
- **AUDIT-002:** A correction MUST preserve before and after values, operator, correction time, and reason. The reason MAY be empty when the operator does not supply one; `PERSONA-009` governs when the interface must require a non-empty reason before proceeding.
- **AUDIT-003:** Operational records MUST use soft deletion or archival; ordinary UI actions MUST NOT physically erase them. The one exception is the explicit permanent-deletion workflow below (`AUDIT-007`–`AUDIT-014`).
- **AUDIT-004:** Closed activities MUST reject ordinary record mutation until reopened or an explicitly permitted annotation workflow is used.
- **AUDIT-005:** External refreshes MUST NOT silently alter operator-authored text.
- **AUDIT-006:** Generated reports MUST record the filters, source revision/snapshot, output type, generator identity, and generation time.

## Permanent deletion

Archiving and removal keep everything. Permanent deletion exists for two
needs archiving can't meet: clearing out test runs and mistakes, and erasing
people's names, call signs, and addresses from this computer once they are no
longer needed.

- **AUDIT-007:** The operator MUST be able to permanently delete any activity,
  in any state (scheduled, active, or closed; archived or not). Deletion MUST
  erase the activity, all its check-ins (including removed ones), all its
  spotter reports, and every history event recorded on any of them.
- **AUDIT-008:** Before deleting an activity, the interface MUST say exactly
  what will be erased (the activity's title and how many check-ins and spotter
  reports), that it cannot be undone, and that existing backups and exported
  files are not affected; it SHOULD suggest exporting first. The operator MUST
  confirm by typing the activity's title.
- **AUDIT-009:** Erased data MUST be overwritten in the database file, not left
  recoverable in its free space.
- **AUDIT-010:** Deleting an activity MUST leave one history event saying that
  an activity was permanently deleted, when, and by which operator, holding only
  its title and the counts of what was erased — none of the erased content.
- **AUDIT-011:** Deleting the focused activity MUST move focus to another open
  activity, or to none (`UX-OPS-014`).
- **AUDIT-012:** An operator who has never been recorded on anything (no
  check-in, spotter report, or history event names them) MAY be permanently
  deleted, after confirmation.
- **AUDIT-013:** An operator who has been recorded on something MUST NOT be
  deleted, since that would lose who did what. Such an operator MAY instead be
  **retired**: hidden from operator lists and pickers, while history keeps
  showing their name. Retired operators MUST be listed where they can be
  restored. Retiring and restoring MUST each create an audit event.
- **AUDIT-014:** Deleting or retiring the current operator MUST change the
  current operator to another one, or to none.

## Example

```text
Local: 2026-09-03 21:44:23 EDT
UTC:   2026-09-04 01:44:23Z
Event: Report received from K4ABC
Entered by: NCS Operator
Entered: 2026-09-03 21:45:02 EDT / 2026-09-04 01:45:02Z
```

## Acceptance examples

```gherkin
Scenario: Correct an earlier observation time
  Given a report was entered at 21:45 local time
  And the reporter states that the damage occurred at 21:30
  When the operator changes the observed time to 21:30
  Then the entered time remains 21:45
  And both times have UTC equivalents
  And the correction records the operator, reason, before value, and after value
```

