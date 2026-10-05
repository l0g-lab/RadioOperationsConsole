# Feature: Weekly Net Operations

## Status

Draft — first vertical slice in active implementation.

## Purpose

Supports the recurring weekly directed or simple net: opening, rapid check-ins,
lightweight traffic marking, announcements, and closing with a summary. This is
the highest-frequency activity type and the primary reason an NCS opens the
application, so its working screens MUST optimize for speed and glanceability
over completeness.

## Relationship to other documents

- This document is the canonical source for the weekly directed-net
  procedure. [05-event-and-template-model.md](../05-event-and-template-model.md)
  defines the cross-activity lifecycle and activity-type rules this procedure
  runs on top of, and points back here for the procedure itself.
- Builds on the shell, tab, and check-in interaction requirements in
  [06-application-shell-and-navigation.md](../06-application-shell-and-navigation.md)
  (see `UX-CI-*`).
- Governed by the weekly-net capability boundary in
  [02-scope-and-release-boundaries.md](../02-scope-and-release-boundaries.md).

## Primary workflow (weekly directed-net baseline)

1. Focus or create the scheduled net activity, run by the net control operator.
2. (The operator is chosen when the activity is created.)
3. Confirm the channel and start the net.
4. Display the optional opening script.
5. Record check-ins rapidly.
6. Mark stations with traffic.
7. Record announcements and significant activity.
8. Call and disposition listed traffic.
9. Display the optional closing script.
10. Close the net and generate a summary.

Steps 5–6 dominate operator attention for most of a session's duration and are
the subject of this feature slice. Steps 3, 4, 7, 8, 9, and 10 are out of scope
for this slice and remain tracked as future work under this same feature.

## Screen composition

The **Check-ins tab** is the primary workspace for a focused weekly-net
activity, not a supplementary panel. When an operator is running check-ins,
that tab — not a sidebar — is where they work for the majority of the
session.

- **NETOPS-001:** The Check-ins tab MUST render rapid check-in entry and the
  activity's check-in roster as the tab's main content, occupying the full
  available content width and height (not a fixed-width side panel).
- **NETOPS-002:** The call-sign entry control MUST be visually prominent
  (large, top-of-workspace) since it receives continuous keyboard input for
  the duration of the net.
- **NETOPS-003:** The check-in roster MUST be presented as a scannable list or
  table sized to show many rows at once, growing with the available window
  height rather than being clipped to a short fixed-height box.
- **NETOPS-004:** Any activity/operator context needed to record a check-in
  (focused activity, acting operator override) MUST be visible at the top of
  the Check-ins workspace, but MUST be secondary in visual weight to the
  call-sign entry and roster.
- **NETOPS-005:** Global setup actions not specific to running check-ins
  (creating operator profiles, creating new activities) MUST remain in the
  Operations tab/sidebar rather than crowding the Check-ins workspace.
- **NETOPS-006:** Switching to the Check-ins tab MUST NOT lose the current
  rapid-entry mode, in-progress call-sign text, or roster selection state.

This elaborates `UX-CI-001` through `UX-CI-005` in
[06-application-shell-and-navigation.md](../06-application-shell-and-navigation.md)
and the shell requirement `UX-CI-006` added there: the Check-ins tab MUST NOT
be reduced to a narrow sidebar widget.

## Functional requirements

- **NETOPS-010:** A check-in MUST require only a call sign or tactical
  identifier; name, location, traffic, and comment remain optional unless the
  activity's type makes them required (as a range check does).
- **NETOPS-011:** Saving a check-in MUST associate it with the focused
  activity unless the operator explicitly selects another open activity
  (`EVENT-010`).
- **NETOPS-012:** Saving a check-in in rapid-entry mode MUST clear the
  call-sign field and return keyboard focus to it (`UX-CI-001`).
- **NETOPS-013:** The roster MUST show newest check-ins in a position where
  they are immediately visible without scrolling, to support quick
  correction (`UX-CI-005`). The roster, like the spotter-report and relay
  message lists, MUST offer a button switching between newest first and
  oldest first, remembered on this computer for that kind of list.
- **NETOPS-014:** Selecting a roster entry MUST expose a direct action to
  create a linked report or traffic item (`UX-CI-004`) without navigating away
  from the Check-ins tab.
- **NETOPS-015:** The roster SHOULD display each check-in's QTH location and
  grid square when known (see
  [qrz-callsign-enrichment.md](qrz-callsign-enrichment.md)), as their own
  separate columns rather than combined into one, to support quick distance
  and propagation awareness during the net.
- **NETOPS-016:** The roster's check-in time MUST display both local and UTC
  time, each on its own line, so both remain readable without truncation or
  horizontal scanning (extends `TIME-003`).
- **NETOPS-017:** The roster SHOULD display each check-in's full mailing
  address, when known, as its own column (`QRZ-029`). Overflowing address
  text MAY truncate with the full value available on hover so the roster
  stays scannable at typical laptop resolution (`PERSONA-006`).

## Channel and frequency

This is a ham radio application; an activity is always conducted on a
specific channel or frequency (baseline step 3, "confirm the channel").
That value has been named in the spec since the persistent-header and
template-model documents were first drafted but never actually implemented
until now.

- **NETOPS-040:** An activity MUST be able to record a channel/frequency as
  free text (e.g. a repeater description with offset/tone, or a simplex
  frequency), typed or filled in by picking a repeater from the directory
  (`RPT-020`), set at creation and correctable afterward on the same terms
  as title and scheduled date (`UX-OPS-010`).
- **NETOPS-041:** Channel/frequency MUST remain optional. Activities
  created without one, or created before this field existed, MUST NOT be
  blocked, degraded, or require a correction before other operations
  proceed.
- **NETOPS-042:** The focused activity's channel/frequency, when set, MUST
  be visible from the Check-ins workspace, so the operator has it at hand
  while running the net without switching to the Operations tab. Per
  `NETOPS-004`, it MUST remain secondary in visual weight to call-sign
  entry and the roster.

## Activity location

An activity may be run from somewhere other than the operator's usual
station — a field deployment, a county EOC during an activation — and that
site may not have a known zip code, address, or grid square to type.

- **NETOPS-043:** An activity MUST be able to record its own location —
  where net control is, kept apart from the repeater it runs on
  (`RPT-021`) —
  optional and set/correctable on the same terms as title and scheduled
  date (`UX-OPS-010`), via any of the entry methods in `CIMAP-073` (text
  search, map click, or GPS coordinates).
- **NETOPS-044:** When an activity's location is unset, the check-in
  location map MUST fall back to the operator's own default location
  (`CIMAP-060`) rather than showing no reference point at all.
- **NETOPS-045:** Setting an activity's location MUST NOT alter the
  operator's own stored default location, and vice versa — they are
  independent values with a precedence order (`CIMAP-060`), not a shared
  field.

## Check-in correction and removal

- **NETOPS-030:** The operator MUST be able to correct a saved check-in's
  call sign and name from the Check-ins workspace without leaving the tab.
- **NETOPS-031:** Correcting a check-in MUST record an audit event capturing
  the before and after values, the acting operator, and the correction time
  (`AUDIT-001`, `AUDIT-002`).
- **NETOPS-032:** The operator MUST be able to remove a saved check-in from
  the roster. Removal MUST use soft deletion (`AUDIT-003`): the check-in is
  hidden from the active roster and MUST NOT be physically deleted.
- **NETOPS-033:** Removing a check-in MUST require an explicit confirmation
  step (`PERSONA-009`) and MAY capture an optional reason.
- **NETOPS-034:** The Check-ins workspace MUST offer a way to view and
  restore removed check-ins for the focused activity.

## Exporting the roster

The active roster for the focused activity can be exported for use outside
the application — handing it to another system, or to another operator
over Winlink when there's no other path to deliver it.

- **NETOPS-046:** The active (non-voided) roster for the focused activity MUST
  be exportable as CSV, containing the fields shown in the roster
  (`NETOPS-015`), including coordinates and traffic (`NETOPS-050`). The export is
  offered in the activity's Exports & forms ([activity-exports.md](activity-exports.md)), not in
  the Check-ins workspace itself.
- **NETOPS-047:** *(Superseded.)* The roster's Winlink ICS-213 export was
  replaced by the ICS 309 Communications Log, with its own Winlink import data
  and a printable form ([ics-form-exports.md](ics-form-exports.md), `ICSF-010`
  onward). The ICS 213 now carries spotter reports.
- **NETOPS-048:** All export formats MUST run entirely offline (no network
  request), consistent with `VISION-002`.

## Traffic on a check-in

A station checking in often has traffic to pass. It is noted on the check-in
itself, so it stays with the station and the time it was reported, rather than
in a separate list.

- **NETOPS-050:** A check-in MUST carry a "has traffic" flag, optional traffic
  details, and a "handled" mark. This is the traffic-none or traffic-listed
  state of the net (`SCOPE`, weekly-net capability).
- **NETOPS-051:** The check-in entry form MUST always show a traffic field,
  with no separate checkbox. A check-in has traffic exactly when something is
  entered there; left blank, it has none.
- **NETOPS-052:** The check-in correction form (`NETOPS-030`) MUST show the
  same field. Clearing it MUST mark the check-in as having no traffic, which
  clears the handled mark.
- **NETOPS-053:** The roster MUST show a "Show traffic" action on check-ins
  that have traffic, and MUST NOT show one on those that do not. It MUST
  reveal the details beneath that check-in, as spotter-report notes are
  revealed, and MAY be opened for several check-ins at once.
- **NETOPS-054:** The revealed traffic MUST offer a "Handled" checkbox, which
  is recorded with an audit event (`AUDIT-001`).
- **NETOPS-055:** Traffic details and the handled state MUST be included in
  the CSV roster export.
- **NETOPS-056:** The activity summary and end-of-net step MUST count check-ins
  with traffic and warn (without blocking) about any not marked handled
  ([activity-lifecycle-and-wrap-up.md](activity-lifecycle-and-wrap-up.md), `LIFE-031`).

Earlier versions kept traffic as free-standing items in a Traffic tab. That tab
was removed; items recorded that way remain in the database and appear in the
History.

## Explicitly out of scope for this slice

- Opening/closing scripts (tracked against baseline steps 3, 4, 9, 10).
- Traffic delivery/disposition beyond the handled mark (baseline steps 6, 8).
- Net conclusion and summary generation (baseline step 10) — since built; see
  [activity-lifecycle-and-wrap-up.md](activity-lifecycle-and-wrap-up.md).
- QRZ-based name enrichment (`UX-CI-003`) — deferred until the QRZ connector
  feature spec is drafted.

## Acceptance examples

```gherkin
Scenario: Check-ins tab is the main workspace
  Given the operator has focused a weekly-net activity
  When the operator switches to the Check-ins tab
  Then the call-sign entry and check-in roster fill the tab's main content area
  And no narrow fixed-width panel is required to record a check-in

Scenario: Rapid entry keeps keyboard focus
  Given rapid-entry mode is enabled on the Check-ins tab
  When the operator enters a call sign and presses Enter
  Then the check-in is saved and appears at the top of the roster
  And keyboard focus returns to the call-sign field

Scenario: Removing a check-in is reversible
  Given a check-in is selected on the roster
  When the operator removes it after confirming
  Then it disappears from the active roster
  And it remains visible and restorable from the removed-check-ins view
  And an audit event records the removal

Scenario: Channel/frequency is visible while running check-ins
  Given the focused activity has a channel/frequency set
  When the operator is on the Check-ins tab
  Then the channel/frequency is visible without switching tabs

Scenario: Activities without a channel/frequency are unaffected
  Given an activity was created before this field existed
  When the operator views or checks stations into it
  Then nothing is blocked or degraded by the missing value
```

## Open questions

- Net-start/net-stop controls and opening/closing scripts (baseline steps
  3–4, 9–10) still need their own requirements before implementation.
  Recording and displaying the channel/frequency itself is now covered by
  `NETOPS-040`–`042`, above.
