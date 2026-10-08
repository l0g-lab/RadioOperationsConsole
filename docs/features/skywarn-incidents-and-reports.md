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
- **SPOT-004:** A report's location MUST be one Location box, like a
  check-in's (`CIMAP-080`): an intersection, address, landmark, mile marker,
  grid square, or GPS coordinates, with **📍 Map** to pick the exact spot. A
  line under the box MUST say where the report will land on the map. On
  saving, text without a picked spot is placed the same way as a check-in's
  (online map search only when connected); text that can't be placed is
  still saved, just off the map. Typing in the box after picking a spot
  MUST drop the picked spot, so the pin never disagrees with the words.
- **SPOT-005:** A report's time MUST be a text box that is blank for "now"
  and accepts `YYYY-MM-DD HH:MM` or `HH:MM` for today, since a report may
  describe an event from earlier in the activation. A time it can't read
  MUST stop the save with a message saying what to type.
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
- **SPOT-014:** The reports list MUST be laid out like the check-in roster
  (`CIMAP-081`), so the two read the same way: Reporter, Hazard (the type,
  with its magnitude under it), Location (the intersection and county, marked
  when it's on the map), Grid Square (worked out offline from the
  coordinates, `CIMAP-010`), Time (local with UTC under it, `NETOPS-016`),
  and Notes, shown on the row. The source, the county, and the coordinates
  MUST be shown on hovering; exports keep every field (`SPOT-051`).
- **SPOT-015:** The list's style MUST follow the check-in roster's: the hazard
  type is the bold, prominent identifier (as the call sign is), the time is
  compact and dim, and text that doesn't fit is cut off with an ellipsis and
  shown in full on hovering, never overflowing into a neighbouring column.

## Entering a report: who, what, where

The form is organized in the order a spotter is asked: who is reporting, what
they saw, and where.

- **SPOT-030:** The report form MUST present its fields in three groups, in
  this order, laid out like the activity form: **Who** (reporter, source),
  **What** (time, hazard type, magnitude, and free-text details), and
  **Where** (the Location box of `SPOT-004`, county, and the map picker).
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
  In the reports list they MUST be shown on the row, cut short to fit, and in
  full on hovering (`SPOT-014`).
- **SPOT-035:** The reports list MUST read who, what, where, as the form
  does, with the time and notes after (`SPOT-014`).
- **SPOT-036:** The Reporter box MUST suggest the activity's checked-in
  stations as you type, matching the call sign or the name, in a list styled
  like the rest of the app (the same one as the station log's Mode box). Tab
  or Enter MUST fill in the highlighted station's call sign; Enter taking a
  suggestion MUST NOT also save. A call sign that matches a check-in links the
  report to it, and the form MUST say whose check-in. Any other text is a
  reporter with no check-in (e.g. a phoned-in public report). The County box
  MUST likewise suggest the counties already named in the activity's
  reports.

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
  CSV and a readable text report, in chronological order, from the Exports
  tab ([activity-exports.md](activity-exports.md)).
- **SPOT-051:** CSV columns MUST follow the form's order — reporter, source,
  time (local and UTC), hazard type, magnitude, notes, county, location, latitude, longitude,
  grid square.
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

## The net's summary

- **SPOT-056:** A SKYWARN net's summary MUST give, after the count of reports
  by hazard: the largest hail and the strongest wind reported (each as its
  magnitude was given, judged by the number it starts with, so a magnitude
  typed as words alone doesn't count), and the number of reports in each
  county, most first. A line with nothing to say MUST be left out. Removed
  reports MUST NOT count.
- **SPOT-057:** The summary's saved text MUST carry the same lines, so what's
  passed on to the NWS or the EC after the net says the same thing
  (`EXPORT-017`).

## NWS alerts attached to the net

What was in effect is part of a SKYWARN net's record. The weather recorded as
a net starts and ends (`WX-*`) already names the alerts at the net's location
then; attaching lets net control keep the ones that mattered, including ones
issued during the net or covering another part of the county.

- **SPOT-060:** A SKYWARN net MUST let the operator attach one or more NWS
  alerts from those in effect now at the net's location (its repeater, else
  net control) and in the Weather tab's area. They MUST be shown as one
  list, each alert once whether or not it's attached, with a tick to keep it
  with the net; the alerts already attached stay on the list after NWS drops
  them. An alert already attached MUST NOT be attached again.
- **SPOT-061:** An attached alert MUST be kept as a copy of what NWS said
  (its name, headline, area, severity, and when it took effect and ends),
  since NWS drops an alert from its feed once it expires.
- **SPOT-062:** The net's summary and its saved text MUST list the attached
  alerts in the order they took effect, each with its area and when it was
  in effect (local time).
- **SPOT-063:** Attaching and removing an alert MUST be recorded in the
  net's history, and MUST be allowed on a closed net (`LIFE-013`).
- **SPOT-064:** Picking alerts needs the internet; working offline, attaching
  MUST be unavailable with a reason, and the alerts already attached MUST
  still be shown.

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
- **SPOT-024:** On a SKYWARN net, the check-in roster's last column MUST be
  "Traffic & reports": the station's traffic as on any net, the hazards of
  the reports linked to it ("Hail ×2, Wind Damage"), and, while the net is
  open, a Report button on every row. Report MUST open the Spotter Reports
  tab with that station as reporter and the report linked to that row; it
  is the way to add a report to a check-in already on the roster. When the
  row has traffic not yet marked handled, the traffic MUST become the
  report's details. Saving a report MUST NOT mark any traffic handled: as on
  any net, traffic is handled once it's passed on (to the NWS, for a
  report), and net control ticks Handled on the roster then, so what's still
  to send stays marked and the summary warns of any left at the end.
- **SPOT-025:** When a new report's reporter is a call sign that isn't on
  the roster, saving MUST check that station in too, as the check-in form
  would with the call sign alone (its name and location looked up, placed on
  the map), and link the report to it; the form MUST say so before saving. A
  reporter that isn't a call sign (a name, "Orange County EM") is neither
  checked in nor linked.
- **SPOT-026:** A report entered on the Spotter Reports tab from a station
  already on the roster is a new call, and the ICS 309 logs each call
  (`ICSF-001`). Saving it MUST log a new check-in for that station, with no
  option to do otherwise: a line at the time it's saved, where the station
  was last placed, with the report in brief as its traffic ("Hail 1.00 in
  (Quarter), Main & 5th, Orange Co."), open until it's passed on
  (`SPOT-024`), and the report linked to it. The form MUST say so before saving, and point to a
  row's Report for adding to a check-in already there (`SPOT-024`). The
  summary counts stations once (`unique stations`), and the map one marker
  per station per place (`CIMAP-090`).

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
- Incidents in the after-action summary. A SKYWARN net's summary already
  gives its reports by hazard and county, the largest hail and strongest
  wind (`SPOT-056`), and its attached NWS alerts (`SPOT-062`); adding
  incidents to it waits until Incidents exists.

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
