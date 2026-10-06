# Changelog

What changed in each release of Radio Operations Console. The newest is at the
top. Each release's section here is also its description on the
[Releases page](https://github.com/l0g-lab/RadioOperationsConsole/releases).

## [Unreleased]

## [2.5.2] - 2026-10-06

### Changed
- **Radar you can zoom and pan.** The Weather tab's radar is now NOAA's live
  radar over the app's own map — zoom in on a storm, pan around, or open it in
  Full view — instead of a fixed animated picture of one radar site. It takes
  the right column, with the alerts moved above the forecast and Now down to
  one line, so there's no Show radar button and no scrolling to see it. It
  loops every scan of the last hour (about 30), saying how old each is
  ("19:42, 4 min ago"), with pause and step back and forward — it starts
  paused if your computer is set to reduce motion — and, left up, picks up new
  scans every five minutes. In Full view, a small strip in the corner keeps
  the play/pause, step, and time. An opacity slider lets the streets show
  through, and the areas of the NWS alerts in effect are outlined — warnings
  in red, watches and advisories in amber.
- **Alerts check themselves every five minutes** while the Weather tab is
  open, so a new warning appears on its own; the Alerts heading says when they
  were last checked.

## [2.5.1] - 2026-10-05

### Changed
- **Settings fits on one screen,** in two columns: Appearance and Online
  services on the left, Offline data and Backup on the right, with one heading
  per panel. Everything saves as you change it — the QRZ and NWS boxes as you
  leave them, with a brief "Saved" — so the Save and Reset buttons are gone.
  **Check login** tries your QRZ login there and then and says whether it
  worked. Offline data and Storage are now one list: each call-sign file,
  the mile-marker roads (each road under *Show roads*), map tiles, and safety
  copies on one row with its status, size, and buttons, and the total. "Last
  backed up" is amber if you never have, or not for a month.

- **The APRS tab shows stations, not a wall of packets.** The heading says
  the area and radius ("APRS — Orlando, FL · 45 mi") with a green **Live**
  and counts while connected. Beside a map fitted to the radius, each
  station takes two short lines: an icon and kind from its APRS symbol
  (Mobile, Home, Weather, Digipeater, IGate…), when it was last heard, how
  far and which way ("4.2 mi NE"), and its comment — a weather station's
  report in words ("88°F · wind W 12 mph gusting 18 · humidity 78%"). On the
  map each station is one marker, labeled and colored by kind, with a trail
  if it's moving; click a station to find it. Radius choices are in miles,
  and the raw packets are a click away.

### Fixed
- **Changing your QRZ username or password** now takes effect at once; the
  old login's session was being kept until it expired.


## [2.5.0] - 2026-10-05

### Changed
- **The History tab reads like a log.** Instead of codes and raw data, each
  line says what happened — "Ended **Tuesday Net**", "Marked **W4ABC**'s
  traffic handled", "Passed the message **wrmr677 for Monroe** to Monroe via
  7.188", "Edited **GMRS net**: title “GMRS” → “GMRS net”" — with the time,
  an icon for what it's about, the net it belongs to (click to go to it), and
  who did it. Lines are grouped by day (Today, Yesterday, …), can be
  searched, and older ones load with *Show older*. An activity's **Full
  history** CSV (Exports & forms) says the same — a *What Happened* column
  and *Who* — before the record as stored.
- **The Nets tab is easier to read.** A **Coming up** box at the top shows
  the next three nets — "On now", "in 25 min", "Tomorrow 07:30" — and each
  meeting in the week below takes one line: time, name, and repeater with
  its frequency. **▶** starts an activity from it; **ⓘ** shows the rest (how
  to tune in, how far the repeater is, who runs it, check-in instructions,
  notes, Edit and Retire). Days with no nets are left out, and the search and
  repeater filter sit beside the heading. A colored band chip (**2m**,
  **70cm**, **10m**, **GMRS**…) shows which radio each net needs, an icon
  shows its type (SKYWARN stands out), a net starting within the hour is in
  amber in Coming up, and Today's heading is highlighted.
- **The same band and type marks elsewhere:** the Repeaters list shows each
  repeater's band (**2m**, **70cm**, **GMRS**…) before its frequency, and an
  event's activities show each activity's type icon and band, with *not
  started* in amber.
- **The Operations tab's activity list is easier to read,** in a wider pane
  beside the tab that scrolls on its own, so the selected activity always
  stays at the top of the tab, however many activities and events there are.
  Sections run in the order things happen — **Open now**, each event as its
  own block in running order (with its day and "1 open · 2 to go · 1 done"),
  **Coming up**, **Station logs**, and **Closed** (folded) — under light
  headings. Each activity takes two short lines: type icon, name, and state
  (open in green, due but not started in amber, closed dimmed), then its
  band, time, and how many check-ins (or messages, or contacts). A net whose
  day passed without being started shows "3 wk ago" in amber at the end of
  Coming up. The search finds any activity by name, event, type, or
  frequency, and **+ New** is at the top. The top bar's Activity list is
  still the quick way to switch from any tab.

## [2.4.2] - 2026-10-05

### Changed
- **The Weather tab is simpler.** Opening it shows everything at once — no
  more Show buttons: **Now** (what the nearest weather station is reporting),
  the **Forecast** one line per period (today and tomorrow, with *Show all 7
  days*; ⓘ opens a period's full wording), and **Alerts** one line each —
  warnings in red, watches and advisories in amber, most serious first, with
  when each ends; click one for the full text. One **Refresh** updates it all. Your area is in the heading
  with a *Change area* link, and with no area set the tab asks for one rather
  than listing alerts for the whole country. Radar is still one click away.
- **Harder to forget to start a net.** A net that hasn't started shows an
  amber banner above the Check-ins and Spotter Reports forms — "This net
  hasn't started — scheduled for 19:00, 5 min ago" — pointing to **Start
  net** in the top bar, where nets are started and ended. There, **Start
  net** and **End net** are now filled green buttons, and *Not started* is
  amber. You can still log check-ins before starting (for early check-ins).

### Added
- **Weather now on a SKYWARN net's Spotter Reports tab:** one line with the
  conditions at the repeater and any alerts in effect there, with Refresh.
- **Weather in the net summary.** As a net starts and as it ends, the app
  reads the weather at the repeater (or net control's location): temperature,
  conditions, wind, and any NWS alerts in effect, such as a Severe
  Thunderstorm Warning. The summary and its text show both, so you can see
  later what the night was like — fewer check-ins with storms about, say.
  It's read only when the net has a repeater or net control location, never
  from the Settings weather area, and not while working offline; when there's
  no reading, the summary says why.

## [2.4.1] - 2026-10-05

### Changed
- **Checking in asks for one Location, not four boxes.** Type an address,
  town, ZIP, cross street, mile marker (*MM 182 turnpike*), grid square, or
  GPS coordinates — or let the call-sign lookup fill it — and the app sorts it
  into address, QTH, grid square, and map position when you save. **📍 Map**
  picks the exact spot before saving, and a line under the box says where the
  station will land. When you're online, anything the offline data can't place
  (a cross street, say) is looked up on the map search. Every station on the
  map gets a grid square, worked out offline. The same one box is used when
  editing a check-in.
- **The check-in roster is simpler:** call sign, name, location (with a pin
  when it's on the map), grid, time, and traffic. Traffic shows right on the
  row — amber until it's handled, then plain text with a green *Handled* tick —
  instead of behind a *Show traffic* button. Hover over a location for the
  full address and coordinates; exports still have every field.
- **The spotter report list matches the check-in roster:** reporter, hazard
  (type with its magnitude), location (with a pin when it's on the map), grid,
  time, and notes — six columns instead of eleven, so it fits without
  scrolling sideways. Notes are on the row (in full on hovering) rather than
  behind a *Show notes* button; the source and coordinates are on hovering,
  and exports keep every field. Station-log contacts show their location the
  same way as check-ins.
- **The spotter report form is simpler**, laid out like the activity form.
  Start typing a reporter's call sign or name and the stations checked in are
  suggested; Tab or Enter fills in the call sign and links the report to
  their check-in. Time is a box — leave it blank for
  now, or type *HH:MM* for earlier today. Where is one Location box, like
  check-ins, with **📍 Map** and a line saying where the report will land;
  if you don't pick a spot, the text is placed on the map when you save.
- **Headings and their buttons line up** in every panel.
- **No more browser autofill** popping up under boxes (offering an event
  name you typed before in a delete confirmation, say). Where suggestions
  help, the app has its own list, matching the rest of the app: Tab or Enter
  fills in the highlighted one.

### Added
- **Suggestions as you type** in a relay's From, For, Passed to and Via
  boxes (the stations and ways already used this session) and a spotter
  report's County (counties already reported).
- **Edit an operator:** correct a name or call sign with the ✎ button in the
  Operators list. The correction shows everywhere they're named, past nets
  included, and is recorded in History.

## [2.4.0] - 2026-10-05

### Added
- **Events tab:** an event brings together the activities of one occasion —
  say the nets and relays of a SET. Create one on the new **Events** tab, add
  its activities from its page (or pick existing ones), and see them in the
  order they run. The page holds the forms for the whole event: its **ICS 214**
  activity log and an **ICS 309** with every net and relay in one log (leave
  any out). The Activities list shows each event as its own group, and when
  you end a net, the window tells you what's next in the event and, within 15
  minutes of its time, offers to start it. The activity form only offers an
  *Event* choice once you have an event.

### Changed
- **An activity's exports are with the activity:** the Exports tab is gone,
  and everything it had — records as CSV or text, the net summary, the ICS 213
  and 309 — is in an **Exports & forms** panel right under the selected
  activity on the Operations tab. The *Exports…* links on the Check-ins and
  Spotter Reports tabs take you there.
- **The activity summary is easier to read:** one fact a line — check-ins,
  traffic (with anything not handled in amber), when it started and ended in
  local time with UTC alongside, how long it ran, and the closing notes —
  without repeating the activity's details shown just above it.
- **The ICS 214 activity log moved to the Events tab,** since it covers an
  event rather than one net; an activity's Exports & forms points to it. Logs
  you've already saved are under *All activity logs* there.

## [2.3.1] - 2026-10-04

### Fixed
- **Full view on maps no longer drops a marker where the button is.**
  Clicking *Full view* or *Exit full view* used to count as a click on the
  map, so when choosing a location it replaced the point you'd picked. Now it
  doesn't, and leaving full view zooms to the point you picked.
- **Repeater and place lists no longer scroll sideways or run under their
  buttons, and names aren't cut off.** Each repeater shows its name and output
  frequency, lined up in columns; the ⓘ button opens its full details (input
  and offset, tone, mode, location, notes, and how many nets use it).
  Operators use the same small icon buttons (make default, edit location,
  remove), so their rows fit on one line.

## [2.3.0] - 2026-10-04

### Changed
- **Repeaters and places take one line each** on the Operations tab, with
  name and frequency (or coordinates) in columns and small Edit and
  Retire/Delete buttons, so a long directory fits on screen. Notes, and how
  many nets use a repeater, show when you hover over it. The tab's right-hand
  column is a little wider to make room.
- **Removing an operator says where they're named:** each activity they run
  or logged in (click to open it), with what they did there, and any changes
  they made to repeaters, places, net listings, and so on. So you know where
  to go — for example, to move an activity to another operator — before
  retiring them.

### Removed
- **Archiving.** Finished nets stay in the Activities list (under *Closed*,
  folded away), so none can go missing; anything you'd archived is back in the
  list. To get rid of an activity for good — test runs and mistakes — use
  *Delete…*. The top bar's Activity list shows what's open or upcoming plus the
  10 most recent closed nets; older ones are in the Activities list on the
  Operations tab.

## [2.2.2] - 2026-10-04

### Added
- **Getting started checklist** for new installs, on the Operations tab: add
  yourself as an operator, download the FCC call-sign directory, and create
  your first activity. Each step ticks itself off, *Download now* goes straight
  to the download in Settings, and optional extras (QRZ login, weather area,
  road data updates) are one click away. It disappears once you're set up, or
  when dismissed.
- **A reminder on the Check-ins tab** when call signs can't fill in yet (no
  FCC directory and no QRZ login), with a link to the download.

### Changed
- **README:** first-run steps, the tab guide, and the feature list brought up
  to date.

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

[Unreleased]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.5.2...HEAD
[2.5.2]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.5.1...v2.5.2
[2.5.1]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.5.0...v2.5.1
[2.5.0]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.4.2...v2.5.0
[2.4.2]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.4.1...v2.4.2
[2.4.1]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.3.1...v2.4.0
[2.3.1]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.2.2...v2.3.0
[2.2.2]: https://github.com/l0g-lab/RadioOperationsConsole/compare/v2.2.1...v2.2.2
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
