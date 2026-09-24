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
- **AUDIT-003:** Operational records MUST use soft deletion or archival; ordinary UI actions MUST NOT physically erase them.
- **AUDIT-004:** Closed activities MUST reject ordinary record mutation until reopened or an explicitly permitted annotation workflow is used.
- **AUDIT-005:** External refreshes MUST NOT silently alter operator-authored text.
- **AUDIT-006:** Generated reports MUST record the filters, source revision/snapshot, output type, generator identity, and generation time.

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

