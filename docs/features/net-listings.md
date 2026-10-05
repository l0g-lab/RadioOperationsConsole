# Feature: Net Listings

## Status

Draft — implemented, except as listed under "Not yet built".

## Purpose

A reference of the nets an operator may want to join: when each meets, how
to get a radio on it, whether the repeater is in reach, and how to check in.
Operators otherwise keep this in a spreadsheet they have to open; in an
emergency the same list answers "which nets are running, and where." Net
listings keep it in the app, offline, next to the repeaters the nets meet
on.

Whoever runs a given net changes from week to week, so the app doesn't
record whose net it is. Any listing can be used to start an activity, for
whoever happens to be net control, but that is a convenience beside the
reference, not its purpose.

It is reference data, not a calendar: nothing reminds, notifies, or tracks
who attended.

## Relationship to other documents

- Listings name a repeater from the directory
  ([repeater-directory.md](repeater-directory.md)).
- Starting an activity from a listing fills the create-activity form
  (`UX-OPS-006`) the way picking a repeater does (`RPT-020`–`021`).
- Opening and closing scripts (planned, a separate spec) will be held on the
  listing.
- Included in database backups ([database-backup-restore.md](database-backup-restore.md)).

## What a listing holds

- **NETL-001:** A listing MUST have a name ("Orange County ARES Net") and an
  activity type (`LIFE-050`), directed net by default.
- **NETL-002:** A listing MAY name a repeater from the directory, or instead
  hold a frequency as free text for one that isn't a repeater (simplex, HF,
  "146.520 then 147.000"). A listing follows its repeater: editing the
  repeater changes what the listing shows. A listing on a retired repeater
  keeps it, marked as retired.
- **NETL-003:** A listing MUST have a schedule, one of:
  - **Weekly**, on one or more weekdays ("Tuesdays", "Monday–Friday").
  - **Monthly**, on a weekday in one or more weeks of the month ("2nd and 4th
    Thursday", "last Sunday").
  - **As needed**: no fixed time (an ARES activation net, a SKYWARN net).
- **NETL-004:** A weekly or monthly listing MUST have a start time and MAY
  have an end time, in this computer's local time.
- **NETL-005:** A listing MAY hold who runs it (net manager or sponsoring
  group, as free text) and notes. Anything the schedule can't express
  ("not on holidays", "5th Thursday is a social net") goes in the notes.

- **NETL-006:** A listing MAY hold check-in instructions: what a station
  should know before checking in ("call sign and name, mobiles first,
  check-ins start at 19:05").
- **NETL-007:** The activity type used when starting an activity from the
  listing MUST be entered apart from the rest, as something only net control
  needs ("If you run this net"), and MUST NOT be shown in the list.

## Managing listings

- **NETL-010:** The operator MUST be able to add, edit, and retire listings.
  A retired listing is hidden but kept, and MAY be restored.
- **NETL-011:** Editing or retiring a listing MUST NOT change any activity
  started from it.

## Seeing what's on

- **NETL-019:** Listings MUST have their own "Nets" tab, placed just before
  Settings so the keyboard shortcuts of the tabs used while running a net
  don't change. The tab MUST work the same whatever activity is focused,
  or none.
- **NETL-020:** Listings MUST be shown as the coming week, one heading per
  day starting today ("Today · Fri Oct 2", "Tomorrow · Sat Oct 3", "Sun Oct
  4"), each day's nets in start-time order. A net that meets on several of
  those days MUST be listed under each; a day with no nets is left out.
  Today MUST leave out nets already over, and mark one under way (between
  its start and end time, or for an hour after it starts when it has no end
  time). After the week come scheduled nets that don't meet in it, under
  "Later" with their next meeting ("Sun Oct 25, 19:00"), then "as needed"
  nets by name.
- **NETL-021:** Each meeting MUST take one line: its time, its name, and its
  repeater with the repeater's one-line frequency ("W4ABC Orlando 146.940
  -0.600 PL 100.0"), or the listing's own frequency text; then ▶ (Start
  activity, `NETL-030`) and ⓘ. ⓘ MUST open the rest under the line: its
  schedule ("Tuesdays 19:00–19:30"), how to tune in (the repeater's output
  and input frequency, offset, tone, and mode: "Output 146.940 · Input
  146.340 (-0.600) · Tone PL 100.0 · FM"), the repeater and its distance
  (`NETL-024`), who runs it, its check-in instructions, its notes, and Edit
  and Retire.
- **NETL-024:** When the current operator has a location and the listing's
  repeater has one, the listing MUST show how far the repeater is ("14.2 mi
  away"), as a guide to whether it's in reach, in its details (`NETL-021`).
- **NETL-025:** Above the week, a **Coming up** box MUST list the next three
  nets, each once at its next meeting, soonest first: "On now · until 08:00"
  in green for one under way, "in 25 min" or "in 2 h 10 min" within 12
  hours, else "Tomorrow 07:30", "Wed 21:00", or the date — each with ▶. A
  net starting within the hour MUST show its time in amber (still to do).
- **NETL-026:** Each line MUST show, at a glance, which radio it needs and
  what kind of net it is: a band chip before the repeater, worked out from
  the frequency ("2m", "70cm", "10m", "GMRS", "MURS", "CB"), colored by group
  (HF, VHF, UHF, personal radio services) in colors clear of the app's
  amber, red, and green; and an icon for the net's type before its name
  (SKYWARN in the storm color). Today's heading MUST be in the accent color.
  The same band and type marks MUST be used elsewhere: the band before each
  repeater's frequency in the Repeaters list (as colored text, leaving the
  names room), the band and type icon on each activity in the Activities
  table (`UX-OPS-015`) and an event's activities, with *open* in green and
  *not started* in amber.
  The top bar keeps neither, having no room to spare.
- **NETL-022:** The list MUST be searchable by name, repeater, frequency,
  and who runs it, and MAY be filtered to one repeater. A repeater in the
  directory MUST show how many listings meet on it.
- **NETL-023:** The list MUST work entirely offline. The next meeting is
  worked out from the schedule; nothing is fetched or stored per occurrence.

## Starting a net from a listing

- **NETL-030:** Every listing MUST offer "Start activity" (▶) as a secondary
  action, which opens the create-activity form filled with the listing's
  name as the title, its type, its frequency (the repeater's one-line form,
  or its frequency text), its repeater, and its start time. The date is the
  day it was started from in the list, or today for "as needed".
- **NETL-031:** Starting from a listing MUST NOT create anything by itself;
  the operator confirms with Create and MAY change any value first.
- **NETL-032:** The activity MUST NOT keep a link back to the listing; it
  keeps its own copies, like a repeater's (`RPT-021`).

## Not in scope

- Reminders, notifications, or alarms of any kind.
- Recording which nets were attended or run.
- Cancellations or one-off changes to a single meeting. If a net doesn't
  meet one week, the list still shows it.
- Schedules beyond weekly, monthly-by-week, and as needed (every other
  week, "unless it's a holiday"); those go in the notes.
- Time zones other than this computer's.
- Calendar export (iCalendar).

## Not yet built

- Importing listings from a spreadsheet (CSV). Held back because people's
  spreadsheets won't share one layout; it needs either a fixed template to
  fill in or a column-matching step, decided when it's built.
- Printing or exporting the list.

## Acceptance examples

- Given a listing "Tuesday Night Net" on W4ABC Orlando, weekly on Tuesday,
  19:00–19:30
  When it is Tuesday 19:10
  Then it is listed under "Today", marked as on now
  And it shows "Output 146.940 · Input 146.340 (-0.600) · Tone PL 100.0 · FM"
  And how far W4ABC Orlando is from the operator.

- Given a listing "Morning Net", Monday to Friday at 07:00
  Then it is listed under each weekday of the coming week
  And not under today once 07:00–07:30 has passed.

- Given a listing "County ARES Net", monthly on the 2nd and 4th Thursday at
  20:00, and today is Friday, October 2, 2026
  Then it is listed under "Thu Oct 8" (the 2nd Thursday)
  And its next meeting after that is October 22 (the 4th), not October 29
  (a 5th Thursday).

- Given the listing "Tuesday Night Net"
  When the operator chooses Start activity under Tuesday's heading
  Then the create-activity form shows the title "Tuesday Night Net", directed
  net, that Tuesday's date, 19:00, `146.940 -0.600 PL 100.0`, and the repeater
  W4ABC Orlando
  And nothing is created until the operator chooses Create.

- Given W4ABC Orlando's tone is changed to PL 103.5 in the directory
  Then the listing shows PL 103.5
  And activities started from it earlier still show PL 100.0.
