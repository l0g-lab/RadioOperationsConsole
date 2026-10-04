# Changelog

What changed in each release of Radio Operations Console. The newest is at the
top. Each release's section here is also its description on the
[Releases page](https://github.com/l0g-lab/RadioOperationsConsole/releases).

## [Unreleased]

## [2.2.1] - 2026-10-04

### Fixed
- **Check-in locations now update.** Looking up a check-in again, or editing
  its address, QTH, or grid square, moves it on the map when its location was
  worked out automatically — for example from a ZIP code's center to QRZ's
  exact point. A location you placed by hand (on the map, or as typed
  coordinates or a mile marker) is never moved.

### Added
- **Sort button** on the check-in and contact lists, spotter reports, and
  relayed messages: switch between newest first and oldest first. Each list
  remembers your choice on this computer.

- **"+ New activity" is easy to find:** a button at the top of the
  Operations tab, and the last entry in the top bar's Activity list. The form
  opens at the top of the page instead of waiting at the bottom.
- **Correct a net's start and end times** from its Edit form, without
  reopening it. The change is recorded in History.

### Changed
- **Each activity has its own operator.** Choose who runs it (net control)
  when you create it — handy if you have both a ham and a GMRS call sign — and
  everything logged in it, and its ICS forms, go under that operator. The top
  bar shows it; the Operator dropdown that used to be there is gone. Ran a net
  under the wrong call sign? Change the operator in the activity's Edit form
  and everything already logged moves with it, with a note in History. One
  operator is the *default* (Operations → Operators → Make default), used for
  new activities and things outside any activity. Existing activities are
  given the operator who logged most of their records.
- **Ending a net: End now, or End at the last check-in.** Next to *End now*,
  the End net window offers *End at 20:48* — the last check-in, or for a net
  you reopened, when it first ended (or a late check-in since, if later). So
  adding a late check-in moves the end a little, but fixing something days
  later doesn't make the net days long. The window's duplicate *Not yet*
  button is gone; *Cancel* closes it.
- **The Operations tab is tidier:** the selected activity's summary is folded
  to one line of counts; click it to see it all. Showing or saving it as text
  is on the Exports tab. Net control location is set
  only when creating or editing an activity, alongside the repeater.
- **The New Activity and Edit forms are laid out the same way,** in labelled
  sections — Net, When, Radio, Net control — with each field's label above it
  and formats as grey hints inside the boxes. Editing a started net adds an
  *Actual times* section for its start and end. The form shows what the type
  needs: a range check asks for its repeater up front, a relay station has no
  repeater field, and a station log has no net control location.
- **Traffic is just a field.** The check-in form always shows the traffic
  field; type something there and the check-in has traffic, leave it blank and
  it doesn't. The "Has traffic" checkbox is gone, here and when editing a
  check-in.
- **Newest check-ins are at the top** of the check-in and contact lists, so
  the one just logged is always in view. Use the sort button to flip it.

## [2.2.0] - 2026-10-04

### Added
- **ICS 214 Activity Log:** on the Exports tab, make an activity log for a
  period of operation — a whole SET, say. It gathers every activity that ran in
  the period (leave any out with a checkbox) and fills itself in: nets opened
  and closed with their counts, closing notes, traffic handled, and spotter
  reports. Change, delete, or add lines as you like; logs are saved, and
  filling again later adds only what's new without undoing your edits. Export
  it for Winlink Express's ICS 214 form (a file for *Load ICS 214 Data*, the
  lines for *Paste Data*, or form data to attach), 24 lines per page, or as a
  printable form.
- **Relay station:** a new activity type for when your job is to move traffic
  from one station to another. Log each message as it comes in — from, for,
  how it arrived, and the sitrep — and it waits in a *To pass* list until you
  record it passed (to whom, and how: a frequency, repeater, phone, Winlink, a
  runner…), record a failed attempt (it stays waiting), or mark it couldn't be
  passed and why. Log replies coming back, linked to the original. Ending the
  relay warns about anything still held. Messages export as CSV, fill the
  ICS 309 (in, failed attempts, and out), and add lines to the ICS 214.

### Changed
- **ICS 309:** each line's message is now just the station's traffic, so lines
  stay short; a station without traffic gets a blank message. Name and location
  are no longer included.
- **ICS forms** are listed in number order on the Exports tab (213, 214, 309).

## [2.1.0] - 2026-10-02

### Added
- **Saved places:** keep the spots you often operate from — home, a friend's
  QTH, the club headquarters — in a Places list on the Operations tab, and
  pick them in any map location picker instead of finding them again. Any
  pinned spot can be saved as a place from the picker.

## [2.0.1] - 2026-10-02

### Added
- **Font and text size** in Settings → Appearance. Choose the system font,
  Atkinson Hyperlegible (designed for easy reading, and included with the
  app), or a wide font, and text from small to extra large. Buttons, fields
  and lists follow the chosen font and size too.

### Fixed
- The settings in Settings → Appearance line up: one setting per row, with
  their dropdowns the same width and starting at the same place.
- **Create activity** and **Cancel** are at the bottom of the new-activity
  form, below the repeater and net control location, instead of in the
  middle of it.
- **Save** and **Cancel** are at the bottom of the form for editing an
  activity, the same way.

## [2.0.0] - 2026-10-02

### Added
- **The summary on the Operations tab** is laid out like the end-of-net step:
  status, counts, how long the net ran, start and end times, unhandled
  traffic, and the closing notes.
- **Show before you save.** Every readable export can be viewed first, with
  Copy and Save:
  - **Show CSV** for check-ins, spotter reports and the full history, shown
    as a table, or as the raw file text.
  - **Show text report** for spotter reports.
  - **Show summary text** for the net summary.
- **Archived nets** can show their summary without being restored.
- **Updates from inside the app.** The app checks for a newer release
  shortly after it starts (never while working offline) and offers it in a
  banner: see what's new, then **Update now** downloads the installer for your
  computer and opens it. Windows installs it and restarts; on Linux the
  package opens in your software installer. Settings has a **Check for
  updates** button too.
- **The app's version** is shown at the bottom of Settings.
- **Colors in the NWS forecast.** Each period is colored by its conditions
  (thunderstorms, rain, snow, fog, clear), with temperature, chance of rain
  and wind chips that stand out as they get stronger.

### Changed
- The repeater and net-control markers on the map are smaller.
- **Security:** the app can now only write files where you choose to save
  them, and the window only loads content from the app itself, map tiles and
  NWS radar.
- Installers now carry the publisher, a description, and a link to the
  project, shown in Windows' installed apps and Linux package managers.

### Removed
- **JSON exports** (check-ins, spotter reports, and the whole-activity
  package). CSV and readable text remain, and a database backup still keeps
  everything.

## [1.3.0] - 2026-10-02

### Added
- **Nets tab:** the nets in your area that you might want to join, day by day
  for the coming week.
  - **When:** each day's nets in time order, with nets on now highlighted.
    Monthly nets that don't fall this week are listed under *Later*, and
    activation nets under *As needed*.
  - **How to tune in:** output and input frequency, offset, tone (PL or DCS)
    and mode.
  - **How far:** the distance from your operator location to the repeater.
  - **How to check in:** each net's check-in instructions, who runs it, and
    notes.
  - **Start activity** from any listed net, with the title, type, date, time,
    frequency and repeater already filled in.
- **Repeater directory:** keep each repeater once (name, output frequency,
  offset, input and output tones, mode and location) and pick it when creating
  or editing an activity. The check-in map shows the repeater and net control
  as separate icons, and measures distances from the repeater when there is
  one.
- **Range checks:** a new activity type for testing a repeater's reach. Each
  station's check-in records the cross street pinned on a map, station type
  (Mobile, Base or HT), power, antenna for base stations, and how each side
  hears the other on a five-step scale from *Full quieting* to *Unreadable*.
  The map colors each station by signal quality.
- **Safer upgrades:** before an update changes your data, a copy is saved
  automatically and the app tells you where. Each database change is applied
  completely or not at all.

### Removed
- **Activity templates.** The repeater directory and the Nets tab now cover
  what they did. Saved templates are kept in the copy made before the update.

## [1.2.1] - 2026-10-01

### Changed
- The activity sidebar is reorganized.
- Improvements to entering and listing station-log contacts.

## [1.2.0] - 2026-10-01

### Added
- **Station log:** a running log of your own contacts (for example VHF
  simplex from a set location), with frequency, mode, signal reports, power,
  antenna and notes, and who you've worked before.

## [1.1.2] - 2026-10-01

### Added
- A full-screen map option.
- More highway mile markers (SR 41/90).
- Settings shows where each kind of downloaded data is kept.

## [1.1.1] - 2026-10-01

### Added
- New icons.

## [1.1.0] - 2026-10-01

### Added
- **Work offline:** one click stops all network use.
- **GMRS call-sign lookup** from an offline copy of the FCC GMRS database.
- **Permanent delete** for activities and operators, with operators who have
  records retired instead.
- Settings lists downloaded and cached files and can clear them.
- Clearer export file names.

### Fixed
- A call-sign lookup could fill in the wrong station when a call was typed
  slowly.
- Windows builds.
- Buttons that sometimes needed a second click.

## [1.0.0] - 2026-09-24

The first release.

[Unreleased]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.2.1...HEAD
[2.2.1]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v1.3.0...v2.0.0
[1.3.0]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/l0g-lab/RadioOperationsConsole/releases/tag/v1.0.0
