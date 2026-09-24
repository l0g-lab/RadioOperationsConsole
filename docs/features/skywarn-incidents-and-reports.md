# Feature: SKYWARN Spotter Reports (and, later, Incidents)

## Status

Draft — Spotter Reports is implemented. Incidents (see "Future increment"
below) is not yet built.

## Purpose

Gives an operator a structured way to log ground-truth severe-weather
observations — hail, wind damage, flooding, tornadoes, snow/ice — reported
by spotters, other amateur radio operators, emergency management, law
enforcement, or the public during a SKYWARN activation. This is the
application's primary SKYWARN-specific data type, distinct from a
Check-ins roster (who is on the net) and from NWS Alerts (official
warnings): a spotter report is what a human observed on the ground.

Sourced from a real-world SKYWARN operator console's manual, adapted to
this application's existing domain model (activities, operators,
locations) rather than reproducing that tool's design wholesale.

## Relationship to other documents

- A spotter report belongs to the focused activity, the same way a
  check-in does (`NETOPS-011`) — a SKYWARN activation is modeled as an
  activity like a weekly net is, not a separate concept.
- Reuses the same three-method location entry (free-text search, map
  click, GPS coordinates) already built for operator/activity locations
  (`CIMAP-073`) via the shared `LocationPicker` component, rather than
  inventing a fourth way to enter a location.
- Reuses Maidenhead grid-square math (`CIMAP-010`) to display a derived
  grid square alongside plotted coordinates, consistent with how the
  check-in location map does it.
- Follows the soft-delete and audit-trail conventions in
  [07-time-audit-and-record-history.md](../07-time-audit-and-record-history.md)
  (`AUDIT-001`–`003`): reports are corrected and removed the same way
  check-ins are, never hard-deleted.
- Alerts (`NWSA-*`) and Spotter Reports remain unlinked for this
  increment — see "Future increment" below.

## Functional requirements

- **SPOT-001:** A spotter report MUST require, at minimum, a hazard type
  and a time; every other field is optional, since a report phoned in
  quickly may not have all details.
- **SPOT-002:** The hazard type MUST be selected from a fixed set (Hail,
  Wind Damage, Flooding, Tornado, Snow/Ice Accumulation, Other) rather
  than free text, so reports stay consistent enough to summarize later.
- **SPOT-003:** The report source MUST be selected from a fixed set
  (Amateur Radio Spotter, Trained Spotter, Emergency Management, Public,
  Law Enforcement), reflecting how NWS itself weighs report credibility.
- **SPOT-004:** A report's location MUST support all three entry methods
  from `CIMAP-073` (free-text search, map click, GPS coordinates) in
  addition to a plain descriptive text field (e.g. "Main St and 5th Ave"),
  since a spotter's description and a precise pin are both useful and
  neither should be required to provide the other.
- **SPOT-005:** A report's time MUST default to the current time but
  remain freely editable, since a report may describe an event from
  earlier in the activation.
- **SPOT-006:** Saving a report MUST associate it with the focused
  activity and the acting operator, on the same terms as a check-in
  (`NETOPS-011`).
- **SPOT-007:** The operator MUST be able to correct a saved report's
  fields, recording a before/after audit event (`AUDIT-001`/`002`), on
  the same terms as correcting a check-in (`NETOPS-030`/`031`).
- **SPOT-008:** The operator MUST be able to remove a saved report from
  the active list using soft deletion (`AUDIT-003`), with an explicit
  confirmation step, and MUST be able to view and restore removed
  reports — mirroring `NETOPS-032`–`034` exactly.
- **SPOT-009:** The reports list MUST scope to the focused activity only,
  the same way the check-in roster does (`CIMAP-033`'s precedent for
  activity-scoped views).
- **SPOT-014:** The reports list MUST display exactly these columns, in
  this order: Date, Time, Type, Magnitude, Coordinates, Grid Square,
  Intersection, County, Reporter, Source. Type and Magnitude are separate
  columns, not combined, so a scan down either is consistent. Coordinates
  and Grid Square are their own columns too, separate from Intersection
  (the free-text address/cross streets/landmark description) — mirroring
  the source manual's own separation of descriptive "Location" from
  "Coordinates" (`SPOT-004`'s three entry methods populate the
  coordinates; the plain text field populates the intersection). Grid
  Square is derived offline from the coordinates (`CIMAP-010`'s math run
  in reverse), not separately entered. Date and Time are shown separately
  rather than combined, matching the check-in roster's precedent
  (`NETOPS-016`) of never collapsing time into a single hard-to-scan
  field.
- **SPOT-015:** The reports list's visual style MUST otherwise follow the
  check-in roster's conventions as closely as the extra columns allow:
  the Type column is the bold, prominent identifier (as the check-in
  roster's call sign column is); Date/Time are compact, dim, monospace;
  every other column is dim text that truncates with an ellipsis and
  exposes the full value on hover rather than overflowing into a
  neighboring column, exactly as the check-in roster's address column
  does.

## Entering a report: who, what, where

The form is organized in the order a spotter is asked: who is reporting, what
they saw, and where.

- **SPOT-030:** The report form MUST present its fields in three groups, in
  this order: **Who** (reporter, optional linked check-in, source), **What**
  (time, hazard type, magnitude, and free-text details), and **Where**
  (county, intersection or landmark, and a point chosen with the map picker).
- **SPOT-031:** A report MUST NOT be saved unless it has a reporter, a hazard
  type with a magnitude, and at least one of a county, an intersection or
  landmark, or a map point.
- **SPOT-032:** When a required part is missing, the form MUST show what is
  missing on the page itself, beside the save action, and mark the affected
  group. It MUST NOT use a pop-up, and MUST NOT show the error until the
  operator has attempted to save.
- **SPOT-033:** Pressing Enter in a text field MUST save the report, subject
  to `SPOT-031`.
- **SPOT-034:** The free-text details (notes) belong with the "What" group.
  In the reports list they MUST be hidden by default and revealed per report
  on request, so long notes do not crowd the list.
- **SPOT-035:** The reports list MUST follow the same order as the form
  (reporter and source, then time and type, then location).

## The report map

- **SPOT-040:** The operator MUST be able to view an activity's reports on a
  map. Each report MUST be plotted at the location of the hazard (the
  report's own coordinates), not at the reporting station or the operator who
  logged it.
- **SPOT-041:** Each report MUST be drawn with an icon identifying its hazard
  type — distinct for hail, wind damage, flooding, tornado, and snow/ice, with
  a generic icon for other — and the map MUST include a legend of the types
  shown. Color MUST NOT be the only distinguishing feature (`UX-009`).
- **SPOT-042:** Selecting a marker MUST show the report's type and magnitude,
  time, location text, county, coordinates, reporter, and notes.
- **SPOT-043:** Reports with no coordinates MUST be left off the map and
  counted in a status line. Reports at the identical point MUST be fanned
  apart so none hides another.
- **SPOT-044:** Opening the map with a report selected in the list SHOULD
  open that report's marker.

## Exporting spotter reports

- **SPOT-050:** The activity's active (non-removed) reports MUST be exportable as
  CSV, JSON, and a readable text report, in chronological order, from the Exports
  tab ([activity-exports.md](activity-exports.md)).
- **SPOT-051:** CSV columns MUST follow the form's order — reporter, source,
  time (local and UTC), hazard type, magnitude, notes, county, location, latitude, longitude,
  grid square — and JSON MUST carry the same fields, plus the linked check-in
  when there is one, and the activity for context.
- **SPOT-052:** The text report MUST list, for each report, the time, hazard
  and magnitude, reporter and source, location, coordinates with grid square,
  and notes, so it can be pasted into an email or message.
- **SPOT-053:** All three exports MUST run entirely offline and MUST be
  written where the operator chooses (`NETOPS-048`).
- **SPOT-054:** The end-of-net step MUST offer the spotter-report CSV when the
  activity has reports (`LIFE-033`).
- **SPOT-055:** Spotter reports MUST be exportable as an ICS 213 General
  Message, as Winlink import data and as a printable form, for all reports at
  once or for one complete report
  ([ics-form-exports.md](ics-form-exports.md), `ICSF-040`–`042`).

Other formal forms and agency-specific formats (for example a report format for
a particular NWS office) remain unbuilt (`SCOPE-005`).

## Standard magnitude scales

Free-text magnitude ("about baseball sized?") produces reports that are
hard to compare or summarize, and doesn't match how NWS actually trains
spotters to estimate severity. Where NWS publishes a standard reference
scale, the application offers it directly rather than asking the operator
to recall or transcribe it under storm conditions.

- **SPOT-016:** Hail magnitude MUST offer the standard hail
  size/common-object correlation scale (Pea 0.25 in through Grapefruit
  4.50 in, with Quarter/1.00 in marked as the severe threshold), sourced
  from NWS spotter reference material (NWS Burlington's
  `WindHailReference.pdf` and NWS Detroit/Pontiac's 2023 Spotter Reference
  Guide) rather than an invented scale.
- **SPOT-017:** Wind Damage magnitude MUST offer the standard wind
  speed/damage-indicator scale (8-12 mph Gentle Breeze through 90+ mph
  Destructive Wind, with 58-73 mph marked as the severe threshold),
  sourced from the same NWS reference material as `SPOT-016`.
- **SPOT-018:** Snow/Ice Accumulation magnitude MUST offer accumulation
  increments consistent with NWS's published snow-reporting guidance
  (report the first inch, then every additional 2 inches) and separate
  freezing-rain/sleet glazing increments (1/4 in steps), since snow depth
  and ice glazing are measured differently.
- **SPOT-019:** Flooding and Tornado magnitude MUST offer qualitative
  categories reflecting how spotters are actually trained to report them
  (impact-based for flooding — e.g. "water entering structures"; report
  type for tornado — e.g. "funnel cloud" vs. "tornado, debris observed"
  vs. "waterspout") rather than a fabricated numeric scale, since NWS has
  no official numeric spotter-reported magnitude for either: flood
  severity is reported by impact, not a standard depth chart, and a
  tornado's EF rating is assigned by NWS only after a post-event damage
  survey, never by the spotter in the field.
- **SPOT-020:** "Other" hazard type, and any hazard type's magnitude when
  the standard list doesn't fit, MUST fall back to free text — the
  standard scales assist the common case, they don't constrain it.
- **SPOT-021:** Changing the hazard type MUST NOT discard an
  already-entered magnitude value unless that value doesn't belong to the
  new type's list, so correcting a mis-selected hazard type doesn't force
  re-entering the magnitude.
- **SPOT-022:** The entry form MUST group fields by what they answer —
  what happened (time, hazard type, magnitude), where (county,
  intersection, coordinates), and who reported it (reporter, linked
  check-in, source) — rather than an arbitrary field order, so the form
  can be filled out in the same order a spotter would naturally describe
  an event.
- **SPOT-023:** When Wind Damage is the selected hazard type, the entry
  form MUST show the damage-indicator description for each wind speed
  bucket in `SPOT-017`'s scale (e.g. "large limbs break; shallow-rooted
  trees pushed over" for 58-73 mph), not just the mph range and category
  name, so the operator can ask a caller what they observed — trees
  swaying, branches breaking, structural damage — and pick the matching
  magnitude when the caller has no way to know the actual wind speed.
  Sourced from the same NWS reference material as `SPOT-017`.

## Correlating a report with a check-in

A spotter report is often filed by a station that has already checked in
to the same net. Recording that link turns "someone named Logan called in
hail" into a structured fact tied to a specific roster entry, queryable
later, rather than something only recoverable by matching names by eye.

- **SPOT-010:** The operator MUST be able to optionally link a spotter
  report to one check-in from the focused activity's active roster,
  recorded as a real reference (not by matching call sign text), since a
  reporter is not always a checked-in station and a free-text match would
  be fragile against typos or duplicate call signs.
- **SPOT-011:** Selecting a linked check-in SHOULD prefill the report's
  reporter field from that check-in's call sign and name when the
  reporter field is still empty, but MUST NOT overwrite a reporter value
  the operator has already entered (mirrors the non-destructive prefill
  rule in `QRZ-021`).
- **SPOT-012:** The reports list MUST visibly distinguish a report that
  is linked to a check-in from one that is not.
- **SPOT-013:** The link MUST be optional and remain editable on the same
  terms as any other report field (`SPOT-007`) — including clearing it
  back to an unlinked, free-text reporter.

## Future increment: Incidents

The source manual describes a second, related record type — an
**Incident** — that is deliberately out of scope for this increment:

- An incident is an operator's synthesized account of an unfolding
  situation (title, status such as Monitoring/Elevated/Escalated, a free
  narrative), distinct from a single spotter's raw observation.
- An incident can be created directly from an NWS alert ("copy alert to
  incident") or have an alert appended to its narrative later — the
  alert-to-local-impact link the manual centers on.
- A browsable, filterable incident log (by date range, status, and
  county) parallel to what this document builds for spotter reports.

This is intentionally deferred rather than designed now: it introduces a
new alert-linking surface (`NWSA-*` currently has none) and a
status/severity model this application doesn't have yet. It should get
its own pass through this document (or a split-out one) rather than being
bolted on to the Spotter Reports data model.

## Explicit non-goals for this increment

- Incidents, and any alert-to-report or alert-to-incident linking (see
  above).
- County-based alert filtering (the source manual's "Covered Counties"
  concept) — the Weather tab's area of interest remains a single point,
  unrelated to this feature.
- Slack message formatting and physical letter/label printing — org- and
  printer-specific integrations outside this application's current scope.
- An End-of-Action summary report combining alerts, incidents, and
  spotter reports — worth revisiting once Incidents exists, alongside the
  CSV/JSON/Winlink ICS-213 exports already built for check-ins
  (`NETOPS-046`–`048`).

## Acceptance examples

```gherkin
Scenario: Logging a minimal spotter report
  Given the operator has an activity focused
  When they select "Hail" as the hazard type and save with no other fields set
  Then the report is saved and appears in the reports list for that activity

Scenario: Plotting a report by map click
  Given the operator is entering a new spotter report
  When they open the location picker and click a point on the map
  Then the report's coordinates are set to that point
  And the derived grid square is shown alongside them

Scenario: Correcting a report preserves history
  Given a saved spotter report with hazard type "Wind Damage"
  When the operator corrects it to "Tornado" and saves
  Then an audit event records both the before and after hazard type

Scenario: Removing a report is reversible
  Given a saved spotter report
  When the operator removes it with a reason
  Then it no longer appears in the active reports list
  And it appears in the removed-reports view and can be restored
```
