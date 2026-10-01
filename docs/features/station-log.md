# Feature: Station Log

## Status

Draft — implemented.

## Purpose

Not every record is a net. An operator who makes contacts on their own —
everyday VHF simplex, for example — wants to log them instead of writing them
on paper, and to look back later to see who's who: when they last worked a
station, what that station's name is, and where they are.

A station log is an activity type for that. It is a running log with no start
or end, and each record is a contact carrying its radio details.

## Relationship to other documents

- An activity type alongside those in
  [activity-lifecycle-and-wrap-up.md](activity-lifecycle-and-wrap-up.md)
  (`LIFE-050`–`056`) and [../05-event-and-template-model.md](../05-event-and-template-model.md).
  Like every type it shares the common records (`PRINCIPLE-002`): a contact is
  a check-in record with extra fields, so QRZ and offline call-sign fill-in,
  location resolution, the map, removal and restore, history, backup, and
  exports all apply unchanged.
- Leaves the lifecycle (`LIFE-001`–`007`) as it is; `LIFE-006` already lets an
  activity that was never started accept records.
- Not a contest or award logbook: no dupe checking, scoring, or ADIF/LoTW
  exchange (see "Not yet built").

## The type

- **LOG-001:** There MUST be a "Station log" activity type, selectable wherever
  a type is chosen (creating or editing an activity, templates).
- **LOG-002:** A station log MUST NOT offer Start or End. While it is not
  closed, the header MUST show no lifecycle status or action for it. A station
  log that is closed (for example, closed while it was another type) MUST still
  show as closed and offer Reopen (`LIFE-020`).
- **LOG-003:** While a station log is focused, the check-in tab, entry button,
  roster heading, count, and empty state MUST call its records contacts. The
  tab keeps its keyboard shortcut and position.

- **LOG-004:** A station log MUST NOT ask for a date or time, when created
  or edited; it is saved with none. Changing an activity's type to station
  log clears its date (the earlier date stays in its history).
- **LOG-005:** The activity sidebar MUST list station logs in their own
  "Station logs" group, first and alphabetically, apart from the nets, which
  stay grouped by date (newest first) with undated ones last.

## Contacts

- **LOG-010:** A contact MAY record, besides the usual call sign, name, QTH,
  grid, address and location: the time of the contact, frequency, mode, signal
  report sent, signal report received, power, antenna, and notes.
- **LOG-011:** None of these fields is required. A call sign alone MUST be
  enough to log a contact.
- **LOG-012:** The time of the contact MUST default to now and MAY be set to
  any other date and time, when logging or when correcting a contact, so
  contacts can be written up after the fact. It is typed in this computer's
  time as `YYYY-MM-DD HH:MM`, seconds optional, or `HH:MM` for today (a text
  box, not a date picker: the desktop webviews' native pickers don't reliably
  close). While logging, the empty box MUST show the current date and time,
  running, as its hint, since that is what a blank time logs; when correcting
  a contact it shows the contact's own time, seconds included. It is stored
  in UTC. An unreadable time MUST be refused with a message saying the
  expected format, once the operator leaves the box or tries to save — not
  while they are still typing — and nothing typed is lost.
- **LOG-017:** Every input's hint MUST be shown in full; boxes are sized to
  their hints and wrap to a new line rather than cut a hint off.
- **LOG-013:** When the frequency is left blank, the entry form MUST suggest
  the activity's own frequency, if it has one.
- **LOG-014:** After a contact is saved, frequency, mode, power, and antenna
  MUST carry over to the next one; the time, signal reports, and notes MUST
  start blank.
- **LOG-015:** Mode MUST be free text, with common modes (FM, SSB, AM, CW,
  digital voice and data modes) suggested as it's typed, the first match
  highlighted. Tab MUST take the highlighted mode and move to the next field;
  the arrow keys move the highlight; Enter takes it (a second Enter saves);
  Escape closes the suggestions.
- **LOG-016:** Correcting a contact MUST record its contact details before and
  after in the audit trail (`AUDIT-*`). A correction that doesn't concern the
  contact details (such as a call-sign lookup filling in a name) MUST leave
  them unchanged.

## The log

- **LOG-020:** The roster MUST show each contact's call sign, name, location,
  frequency, mode, signal reports (sent / received), power, antenna, notes,
  and time as columns. Text too long for its column is cut off with the full
  text on hover. Signal reports stay on one line (room for "599 / 599").
  Grid, address, coordinates, and the notes in full MUST be
  available on request for contacts that have any. On a window too narrow for
  every column, the roster scrolls sideways within its panel, headings and
  rows together.
- **LOG-023:** The roster MUST show each contact's straight-line distance in
  miles (kilometers too on hover) from the log's own location, else the
  operator's — the same point the check-in map measures from (`CIMAP-060`,
  `CIMAP-064`) — whole miles from 100 up. A contact with no location, or a
  log and operator with none, shows no distance, and the column's hover text
  says how to set one.
- **LOG-021:** The log MUST be searchable by call sign, name, location, and
  notes, saying so when nothing matches.
- **LOG-022:** Roster exports (CSV and JSON) MUST include the contact fields.

## Worked before

- **LOG-030:** While a call sign is being entered, the entry form MUST say
  whether it appears in earlier records — across every activity, not only the
  focused one — with how many times, and the most recent: when, in which
  activity, on what frequency, and the most recent name and QTH on record.
  Removed records MUST NOT count. Matching MUST ignore case.
- **LOG-031:** This applies to every activity type, worded for each ("Worked
  before" in a station log, "Checked in before" in a net).

## Not yet built

- ADIF export and import (for other logging programs and LoTW).
- A per-station view gathering every contact with one call sign.
- Band derived from frequency, and validation of RST format.

## Acceptance examples

- Given a station log with frequency 146.520
  When the operator types KD4ABC, sets mode FM, RST 59 / 57, and saves
  Then the contact is listed with 146.520 suggested but not stored, FM, and
  "59 / 57"
  And the next contact starts with mode FM already filled in and no RST.

- Given KD4ABC checked in to the Tuesday Net last week as "Pat, Orlando"
  When the operator types KD4ABC in a station log
  Then the form says "Worked before: 1 time — last … in “Tuesday Net” … · Pat, Orlando".

- Given a contact logged with no time
  When the operator edits it and sets yesterday 10:05
  Then the contact shows yesterday 10:05 and the change is in its history.

- Given a station log
  Then the header shows its type but no Start net or End net button.
