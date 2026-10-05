# Application Shell and Navigation

## Navigation model

The application opens into a persistent tabbed shell rather than a task-selection start screen.

Initial primary tabs:

1. Operations
2. Check-ins
3. Spotter Reports
4. Weather
5. Map / APRS
6. History
7. Nets — the net listings ([features/net-listings.md](features/net-listings.md))
8. Events — occasions spanning several activities, with their ICS 214 and
   combined ICS 309 ([features/events.md](features/events.md))
9. Settings

An activity's exports and forms are under it on the Operations tab
([features/activity-exports.md](features/activity-exports.md), `EXPORT-001`),
not on a tab of their own.

Traffic is recorded on the check-in it came from (`NETOPS-050`–`056`) rather than in a tab of its own.

Activity types may hide, deemphasize, or badge tabs. The order and meaning of core tabs remain stable so operators do not relearn navigation between activities.

## Persistent header

The header displays:

- Focused activity and state
- The focused activity's operator (net control)
- Primary channel/frequency
- Local clock
- UTC clock
- Internet state — implemented as an Online/Offline indicator reflecting the
  OS-reported network connection (`navigator.onLine` and the `online`/`offline`
  events), not per-service reachability. The same indicator switches
  "Work offline" on and off (`UX-020`–`UX-026`)
- Connector summary for NWS, radar, APRS, QRZ, and geocoding — not yet built;
  each connector currently reports its own offline/error state where it's used
  (`VISION-002`, `QRZ-031`, `CIMAP-022`) rather than in one header summary
- Activity switcher
- New activity action

## Requirements

- **UX-001:** The shell MUST open without requiring internet access.
- **UX-002:** The operator MUST be able to change tabs without losing unsaved form data.
- **UX-003:** Tabs irrelevant to the activity's type MAY be hidden, but the activity configuration MUST reveal what is hidden.
- **UX-004:** A global activity switcher MUST list open activities and visually identify their states.
- **UX-005:** Switching focused activity MUST preserve per-activity tab and filter state.
- **UX-006:** The interface MUST distinguish global settings/history from records belonging to the focused activity.
- **UX-007:** Common actions MUST use descriptive labels; icons alone are insufficient.
- **UX-008:** Keyboard shortcuts MUST be discoverable and configurable.
- **UX-009:** Status and severity MUST use text or icons in addition to color.
- **UX-010:** The default theme SHOULD use a restrained weather/radio/Linux-console visual language without reducing legibility.

## Working offline

An operator may want the application offline while the computer is online:
on a metered or satellite link, to save bandwidth for other traffic, or to
rehearse a field deployment exactly as it will run.

- **UX-020:** The header's Online/Offline indicator MUST also be the control
  for working offline: activating it (click, Enter, or Space) MUST switch
  "Work offline" on or off. It MUST keep the indicator's appearance rather
  than look like a menu or dropdown, and its tooltip and accessible name MUST
  say that it can be toggled and what it will do.
- **UX-021:** While working offline, the indicator MUST read "Working offline"
  (text, not only color — `UX-009`), distinct from "Offline" for no detected
  connection.
- **UX-022:** While working offline, the application MUST NOT make network
  requests: QRZ, NWS alerts and forecasts, geocoding, APRS-IS, map tiles,
  radar imagery, and data downloads. Each MUST behave exactly as it does with
  no connection, showing its existing offline message; map tiles MUST come
  only from the local cache.
- **UX-023:** Turning working offline on MUST stop a running APRS-IS feed and
  MUST stop a data download in progress, which can be resumed later as after a
  dropped connection (`CALLDIR-033`).
- **UX-024:** The choice MUST persist across application restarts, so the
  application starts offline if it was left offline.
- **UX-025:** Saving other settings MUST NOT change the working-offline choice.
- **UX-026:** Turning working offline off MUST NOT itself make any request;
  online features resume the next time they are used or refresh.

## Keyboard shortcuts

Global shortcuts work from any tab. `UX-008` requires that shortcuts be
discoverable and configurable; an in-app shortcut reference/editor is not
yet built, so these are documented here as the interim source of truth.

- **UX-011:** Ctrl+1 through Ctrl+9 MUST switch to the corresponding tab in
  the order defined in "Navigation model" (Ctrl+0 to a tenth, should there be
  one).
- **UX-012:** Ctrl+K MUST switch to the Check-ins tab and place keyboard
  focus on the call-sign entry field.
- **UX-013:** Ctrl+Shift+Plus and Ctrl+Shift+Minus MUST increase and
  decrease the application's UI zoom level in fixed steps, bounded to a
  reasonable minimum and maximum; Ctrl+Shift+0 MUST reset zoom to 100%.
- **UX-014:** The zoom level MUST persist across application restarts as a
  local display preference. It is per-viewer display state, not operational
  data, and MUST NOT appear in exports, backups, or audit events.

## Check-in interaction

- **UX-CI-001:** Saving a check-in MUST return focus to the call-sign field for the next entry when rapid-entry mode is enabled.
- **UX-CI-002:** Entering a known call sign SHOULD populate the locally stored display name immediately.
- **UX-CI-003:** QRZ enrichment MUST occur asynchronously and MUST NOT delay saving.
- **UX-CI-004:** A selected check-in MUST offer a direct action to create a linked report or traffic item.
- **UX-CI-005:** Recently created check-ins MUST remain visible for quick correction.
- **UX-CI-006:** The Check-ins tab MUST present rapid check-in entry and the activity roster as the tab's primary, full-size workspace. It MUST NOT be reduced to a narrow sidebar widget.

## Operations tab layout

The Operations tab follows the same division of labor as the Check-ins tab
(`UX-CI-006`): the sidebar is for browsing and selecting, and the substantive
work — creating, correcting, and deleting activities, and managing operator
profiles — happens in the tab's main content, not the sidebar.

- **UX-OPS-001:** The Operations sidebar MUST be limited to a browsable,
  clickable list of every activity, used to change the focused activity. It
  MUST NOT contain activity or operator creation, editing, or deletion
  controls.
- **UX-OPS-015:** The sidebar MUST group activities by what is happening,
  not by date, in this order: **Open now** (started, not ended; each with
  when it opened), **Station logs** (`LOG-005`), **Upcoming** (not started;
  soonest first, undated last; each with its day and time), and **Closed**
  (most recently closed first; each with the day it closed). Each group
  MUST show how many it holds; empty groups are left out.
- **UX-OPS-016:** Groups MUST be foldable, with Closed folded by default, and
  which are folded MUST be remembered on this computer.
- **UX-OPS-017:** The sidebar MUST offer a filter by title. While filtering,
  every group with a match MUST be shown open, and a filter with no matches
  MUST say so.
- **UX-OPS-003:** The focused activity MUST be chosen from a selector in the
  application header, visible on every tab, listing each activity not yet
  closed, the 10 most recently closed, and the focused one, with its date and
  time so same-titled activities can be told apart; older ones are chosen from
  the sidebar, which the selector points to. Other tabs MUST NOT carry their
  own activity selector.
- **UX-OPS-004:** The header MUST show the focused activity's frequency and
  offer an "Edit" action that goes to the Operations tab with that
  activity's edit form already open.
- **UX-OPS-005:** The application MUST provide keyboard shortcuts to step to
  the previous and next activity (Ctrl+[ and Ctrl+]), wrapping around, so
  operators running several nets can switch without the mouse.
- **UX-OPS-002:** The Operations tab's main content MUST show the focused
  activity's details with correction and deletion actions, a create-new-
  activity form, and operator profile management (a list of existing
  operators and a create-operator form), so an operator never needs to leave
  the tab to set up who and what a session involves.
- **UX-OPS-007:** The header MUST show the focused activity's lifecycle state
  and the one lifecycle action that applies (start, end, or reopen); see
  [features/activity-lifecycle-and-wrap-up.md](features/activity-lifecycle-and-wrap-up.md).
- **UX-OPS-008:** The header MUST show the focused activity's type next to
  its state.
- **UX-OPS-006:** The create-activity form MUST allow choosing a start time,
  frequency, net control's location, and a repeater from the directory
  ([features/repeater-directory.md](features/repeater-directory.md)). The
  Operations tab MUST also list the repeater directory for editing.

## Activity correction and deletion

Finished activities stay listed (under Closed in the sidebar, folded by
default), so a past net is never out of sight. There is no archiving; an
activity is removed only by permanent deletion, a separate, explicitly
confirmed action (`AUDIT-007`–`AUDIT-011`).

- **UX-OPS-010:** The operator MUST be able to correct an activity's title,
  scheduled date and time, channel/frequency (`NETOPS-040`), and location
  from the Operations tab's main content.
- **UX-OPS-011:** Correcting an activity MUST record an audit event capturing
  the before and after values, the acting operator, and the correction time
  (`AUDIT-001`, `AUDIT-002`).
- **UX-OPS-012:** *(Retired.)* Activities are no longer archived; activities
  archived by earlier versions were brought back into the list on upgrade.
- **UX-OPS-013:** *(Retired.)*
- **UX-OPS-014:** Deleting the focused activity MUST reassign or clear the
  focused-activity selection so the interface never presents a deleted
  activity as focused.

## Map as a supporting tool

The map is accessed through the Map / APRS tab, an embedded location-picker dialog from reports and incidents, or the on-demand check-in location map on the Check-ins workspace (see [features/checkin-location-map.md](features/checkin-location-map.md)).

- **UX-MAP-001:** Opening the location picker MUST preserve the report form beneath it.
- **UX-MAP-002:** The picker MUST accept a textual address, intersection, landmark, or coordinates.
- **UX-MAP-003:** The operator MUST be able to click or drag a marker and review coordinates before applying them.
- **UX-MAP-004:** Applying a mapped location MUST populate mapped label and coordinate fields without overwriting original reported-location text.
- **UX-MAP-005:** The report MUST remain savable when online geocoding or map data is unavailable.

## SKYWARN report entry

The report form shows common fields first and category-specific fields after category selection. It links to the reporting check-in when launched from that station.

Common fields include observed time, received time, reporter, source, county, original location text, mapped location, coordinates, report category, magnitude, measured/estimated state, narrative, verification state, forwarding state, and entering operator.

The form MUST NOT contain Slack or generic team-chat actions.

