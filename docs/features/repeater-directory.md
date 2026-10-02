# Feature: Repeater Directory

## Status

Draft — implemented, except as listed under "Not yet built".

## Purpose

Nets and range checks run on repeaters, and today a repeater is typed in by
hand every time as free text ("146.940 -0.6 PL 100.0"), with its location
set separately. The repeater directory keeps each repeater once, with the
details an operator needs to tell someone how to reach it, and lets an
activity be set up from it.

It is local reference data the operator maintains, available offline. It is
also the base for net listings ([net-listings.md](net-listings.md)), which
name the repeater a net meets on, and for opening/closing scripts that read
out frequency and tone.

## Relationship to other documents

- An activity's frequency text and its repeater can be filled from the
  directory; the activity keeps its own copy. The activity's own location
  (`LOCRES-020`) stays where net control is, and is never the repeater's.
- A range check's repeater (`RANGE-002`) can come from the directory.
- Locations use the shared picker ([location-resolution.md](location-resolution.md)).
- Included in database backups ([database-backup-restore.md](database-backup-restore.md)).

## What a repeater holds

- **RPT-001:** A repeater MUST have a name (for example, its call sign and
  city, "W4ABC Orlando") and an output frequency in MHz. Names are not
  required to be unique, since one call sign often has several machines.
- **RPT-002:** A repeater MUST hold its offset, shown as a direction and
  amount: plus, minus, or simplex (none), with an amount in MHz. The input
  frequency is shown as the output plus the offset. When the operator enters
  an output frequency, the form SHOULD suggest the usual offset amount for the
  band (0.600 MHz on 2 m, 5.000 MHz on 70 cm, 1.600 MHz on 1.25 m, 0.500 MHz
  on 6 m). The direction is never assumed.
- **RPT-003:** A repeater MUST hold its input tone (what a station transmits to
  access it) and its output tone (what it transmits), each of which is one of:
  none, a CTCSS/PL tone, or a DCS code. CTCSS tones MUST be chosen from the
  standard 50-tone list. DCS codes MUST be standard three-digit codes, with
  normal or inverted polarity.
- **RPT-004:** A repeater MAY hold a location (label plus coordinates), a
  mode (FM by default; free text such as DMR, D-STAR or System Fusion), and
  notes (coverage, linking, sponsor, hours).
- **RPT-005:** Every repeater MUST have a one-line form used wherever it is
  shown and when it is copied onto an activity, for example
  `146.940 -0.600 PL 100.0`, `444.500 +5.000 DCS 023N`, or
  `146.520 simplex`. The input tone is the one shown. When the output tone
  differs from the input tone, it is shown after it
  (`PL 100.0 / out PL 123.0`). A mode other than FM is added at the end.

## Managing the directory

- **RPT-010:** The operator MUST be able to add, edit, and retire
  repeaters. A retired repeater is hidden from pickers but kept, and MAY be
  restored. Retiring MUST NOT change any activity.
- **RPT-011:** The directory MUST be listed sorted by output frequency, and
  MUST be searchable by name, frequency, and notes.
- **RPT-012:** Editing a repeater MUST NOT change activities previously set
  up from it (`RPT-021`).

## Using a repeater

- **RPT-020:** Wherever an activity's frequency is entered (creating or
  editing an activity), the operator MUST be able to pick a repeater instead
  of typing. Typing remains available for simplex and one-off frequencies.
- **RPT-021:** Picking a repeater MUST copy its one-line form into the
  activity's frequency and its name and location into the activity's own
  repeater fields. It MUST NOT change the activity's location, which is
  where net control operates from. These are copies, with no link back: the
  activity does not follow later edits to the repeater.
- **RPT-022:** For a range check, picking a repeater that has a location MUST
  satisfy the repeater-location requirement (`RANGE-002`).
- **RPT-023:** An activity's repeater MAY also be set or moved by hand, the
  same way as its location, for a repeater not in the directory.

## On the map

- **RPT-030:** The check-in map MUST mark the repeater with an antenna-tower
  icon and net control (the activity's location, else the operator's) with
  a radio icon, both distinct from check-in markers and readable in both
  themes.
- **RPT-031:** When the activity has a repeater, distances (roster and map)
  MUST be measured from the repeater, and the map MUST draw lines from the
  repeater to each check-in in one color and a line from net control to the
  repeater in another. Without a repeater, distances and lines run from net
  control, as before.

## Not yet built

- Importing and exporting the directory as a CHIRP-format CSV, to load an
  existing radio programming file or spreadsheet.
- Online repeater-directory lookup (for example, RepeaterBook), as an
  optional add-on only.

## Acceptance examples

- Given the operator adds a repeater "W4ABC Orlando", output 146.940, offset
  minus 0.600, input tone PL 100.0, with a location
  Then it is listed as `146.940 -0.600 PL 100.0`.

- Given that repeater
  When the operator creates a range check and picks it as the frequency
  Then the activity's frequency is `146.940 -0.600 PL 100.0`
  And its repeater is W4ABC Orlando at the repeater's location
  And its own location is still the operator's
  And Create is available without setting a repeater location separately.

- Given an activity created from that repeater
  When the repeater's tone is later changed to PL 103.5
  Then the activity still shows PL 100.0.
