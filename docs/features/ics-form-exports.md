# Feature: ICS Form Exports (ICS 309 and ICS 213)

## Status

Draft — implemented. ICS 309 (Communications Log) is produced from the
check-in list, and ICS 213 (General Message) from spotter reports. Each comes as
data for Winlink Express and as a printable HTML file.

## Purpose

Served agencies and net control stations ask for the standard ICS forms, and
most exchange them over Winlink. The records are already in the application, so
the forms should fill themselves in, leaving the operator to check and add what
only they know.

## Relationship to other documents

- The 309 draws on check-ins ([weekly-net-operations.md](weekly-net-operations.md))
  and the activity's start and end ([activity-lifecycle-and-wrap-up.md](activity-lifecycle-and-wrap-up.md)).
  The 213 draws on spotter reports ([skywarn-incidents-and-reports.md](skywarn-incidents-and-reports.md)).
- Implements part of the output capability in
  [02-scope-and-release-boundaries.md](../02-scope-and-release-boundaries.md)
  (printable output; Winlink Standard Forms load-data adapters) and
  `SCOPE-005`/`SCOPE-006`.
- Replaces the earlier Winlink ICS-213 export of the check-in roster
  (`NETOPS-047`): the roster is now the ICS 309.
- Not covered: other ICS forms, agency-specific layouts, and any Winlink
  transport (`SCOPE-NG-004`).

## Which record feeds which form

- **ICSF-001:** The ICS 309 MUST be built from the activity's check-ins. The
  ICS 213 MUST be built from its spotter reports: all of them in one message,
  or one complete report.
- **ICSF-002:** Removed check-ins and reports MUST NOT appear.

## Winlink import data

Each form MUST be offered in the shapes Winlink Express takes, and labeled as
data to load into Winlink, not a sent or queued message (`SCOPE-006`). The
operator addresses and sends it from Winlink Express; this application has no
Winlink transport. The formats below were checked against Winlink's standard
forms package (1.1.20.0) — the forms' own templates and HTML, and Pat
(github.com/la5nta/pat), an open-source Winlink client whose form output
Winlink Express accepts — and the generated files were run through the real
forms' own loading code and viewer pages. They are not guesses (`SCOPE-005`).

- **ICSF-010 (ICS 309, load file):** The application MUST produce, for Winlink's
  **Form-309 Communications Log** (Standard Forms → ICS USA Forms), a text file in
  the form's own "Save Form 309 Data" format: thirty tab-separated lines of time,
  from, to, subject (blank lines fill a short page), then one line of Task #, Task
  Name, Date/Time Prepared, Operational Period #, Radio Operator Name and Station
  ID, every line ending with a tab. The form's "Load Form 309 Data" button and its
  "Paste Data from a Spreadsheet" box both read it, filling the log and the header.
- **ICSF-011 (page size and limits):** The Winlink form holds 30 lines per page,
  so a longer log MUST be split into pages of 30, each its own file and message.
  Values MUST be cut to the form's field lengths — time 23, from 13, to 13, subject
  90, Task # 7, Task Name 50, Date/Time Prepared 18 (`YYYY-MM-DD HH:mm`), Operational
  Period # 15, Operator Name 35, Station ID 13 — a cut marked with an ellipsis, and
  the operator MUST be told how many lines were shortened. Times MUST include the
  date.
- **ICSF-012 (ICS 309, form data):** The application MUST also produce Winlink
  form-data XML for a page — a file named exactly
  `RMS_Express_Form_Form-309_Viewer.xml` with the form's own field names (Title,
  Page, Task, TaskName, ActivityDateTime1, OpPer, OpName, OperId, Time1–30,
  From1–30, To1–30, Sub1–30, Templateversion) — together with the message subject
  and text Winlink builds from the form's template, so the operator can start a
  message, paste them, and attach the file.
- **ICSF-013 (ICS 213, form data):** The application MUST produce ICS-213 form data:
  a file named exactly `RMS_Express_Form_ICS213_Initial_Viewer.xml`, with the ICS213
  form's own field names (`inc_name`, `to_name`, `fm_name`, `Subjectline`, `Mdate`,
  `Mtime`, `Message`, `Message2`, `Approved_Name`, `Approved_PosTitle`,
  `Templateversion`) and its optional fields left empty, and the message subject and
  text Winlink builds from the ICS213 template. Names and positions MUST be joined
  into the form's single To and From fields.
- **ICSF-014 (structure):** Form-data XML MUST use the `RMS_Express_Form` root with
  a `form_parameters` block naming the viewer (`display_form`) and a `variables`
  block in name order, and MUST carry the standard variables Winlink and Pat add to
  every form (`msgsender`, `msgto`, `msgcc`, `msgsubject`, `msgbody`, `msgp2p`,
  `msgisreply`, `msgisforward`, `msgisacknowledgement`, `msgseqnum`, `txtstr`). Text
  MUST be XML-escaped.
- **ICSF-015 (plain text):** Text destined for Winlink MUST use plain punctuation
  (dashes, quotes, and ellipses in their ASCII forms), since messages may travel over
  radio.
- **ICSF-016 (delivery):** The dialog MUST let the operator copy the load text, save
  the load file, save the form-data file, and copy the subject and message text. For
  a multi-page log it MUST let them step through pages and save every page into a
  folder, one subfolder per page holding its load file, form data, and message text.
  It MUST tell the operator how to load each into Winlink.

## Printable forms

- **ICSF-020:** Each form MUST also be available as one standalone HTML file
  that needs no network, so it can be opened in any browser and printed or saved
  as a PDF. The application MUST tell the operator this after saving.
- **ICSF-021:** The form MUST carry the numbered items and wording of the ICS
  form it is named for, on a letter-size page. It is this application's own
  layout of those items, not a scan or official reproduction, and documentation
  MUST NOT claim otherwise (`SCOPE-005`).
- **ICSF-022:** All record text MUST be escaped so a name or note cannot alter
  the markup; line breaks in messages MUST be kept.
- **ICSF-023:** The operator MUST be able to review and change every field
  before saving. Nothing is written until they save.

## ICS 309 — Communications Log

- **ICSF-030:** The log MUST list every check-in, oldest first. Each line shows
  the time, the station's call sign as *from*, net control (the acting operator)
  as *to*, and a message saying the station checked in, with its name and
  location and any traffic, including whether it was handled.
- **ICSF-031:** Printed times MUST be local, 24-hour, with the date added when
  the entries span more than one day. The Winlink rows MUST always include the
  date (`ICSF-011`).
- **ICSF-032:** Fields MUST default as follows: incident and net name from the
  activity's title; operational period from when the activity was started and
  closed (else its first and last check-ins); radio operator and *prepared by*
  from the acting operator; prepared time from now. Message-number columns and
  the signature MUST be left blank.
- **ICSF-033:** The printed table's header MUST repeat on each page and a line
  MUST NOT split across pages.
- **ICSF-034:** The ICS 309 MUST be reachable from the Exports tab and the
  end-of-net step.
- **ICSF-035:** Winlink header values MUST default as follows: Task Name from the
  activity's title; Operator Name and Station ID from the acting operator; Date/Time
  Prepared from now; Operational Period # from the start date as `YYYYMMDD`; Task #
  blank. The operator MUST be able to change them.

## ICS 213 — General Message

- **ICSF-040:** The ICS 213 MUST be offerable for all of an activity's spotter
  reports as one message and for one report, from the Exports tab and the
  end-of-net step, and for one report from the selected report's actions in the
  reports list, including on a closed activity, where it changes nothing.
- **ICSF-041:** The message MUST carry each report completely: time, hazard and
  magnitude, reporter and source, location, coordinates with grid square, and
  notes.
- **ICSF-042:** Fields MUST default as follows: incident name from the
  activity; *from* the acting operator; subject naming the hazard (one report)
  or the activity and count (all reports); date and time of the report (one) or
  now (all). *To*, approval, the reply, and the replied-by items MUST be left for
  the operator.

## Acceptance examples

```gherkin
Scenario: Loading a net's check-ins into Winlink
  Given a net with three check-ins
  When the operator saves the load file and chooses it with Winlink's "Load Form 309 Data"
  Then each check-in is one line with date/time, sender, recipient, and message
  And the header shows the operator, station ID, and task name

Scenario: A long net
  Given a net with 34 check-ins
  When the operator exports for Winlink
  Then there are two pages, the first with 30 lines and the second with 4

Scenario: Sending spotter reports as an ICS-213
  Given two spotter reports
  When the operator saves the Winlink ICS-213 form data
  Then attaching the file to a new Winlink message shows an ICS-213 whose message lists both reports in full

Scenario: Printing
  Given the same reports
  When the operator saves the printable form and opens it in a browser
  Then it prints as a letter-size ICS 213
```
