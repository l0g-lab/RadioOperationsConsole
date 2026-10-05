# Feature: Events

## Status

Draft — implemented.

## Purpose

Some occasions are several activities run as one: an exercise such as a SET,
with a ham net, a GMRS net, and relays at set times, or a real activation that
runs a net and a relay side by side. Run as separate activities, they're hard
to keep track of and to report on as a whole. An **event** brings them
together on its own page on the **Events** tab: its activities in the order
they run, ways to add to it, and the forms that cover all of it — its ICS 214
activity log and one ICS 309.

Events are for those who need them. Nothing outside the Events tab asks for
one, and the activity form only offers a choice once an event exists. Ideas
that would need more (an event's objectives and scenario, a roster, a
frequency plan, event-wide notes) are parked as GitHub issues #1–#4 pending
real-world need.

## Relationship to other documents

- Groups activities from [activity-lifecycle-and-wrap-up.md](activity-lifecycle-and-wrap-up.md);
  each is started and ended as before (`LIFE-001`–`009`).
- Holds the ICS 214 ([ics-form-exports.md](ics-form-exports.md), `ICSF-050`–`056`)
  and an event-wide ICS 309.
- Extends the sidebar (`UX-OPS-015`–`017`) and the tabs
  ([06-application-shell-and-navigation.md](../06-application-shell-and-navigation.md)).
- Not the "event" of [05-event-and-template-model.md](../05-event-and-template-model.md)
  (`EVENT-*`), which means a single activity.

## Events

- **EVT-001:** The **Events** tab MUST list the events, each with its dates
  (its activities' span, else its own optional date), where it is (no
  activities yet, upcoming, under way, finished), and how many activities it
  holds; those under way or upcoming first, finished ones after, latest first.
- **EVT-002:** The operator MUST be able to create an event (a name and an
  optional date), rename it or change its date, and delete it. Deleting an
  event MUST keep its activities and its activity log, no longer part of any
  event. Each of these MUST be recorded in the history.
- **EVT-003:** Event names already given to activities by an earlier version
  MUST become events on upgrade, with those activities and any activity log of
  the same name in them.

## An event's page

- **EVT-010:** An event's page MUST list its activities in the order they run
  (by when they started, else when they're scheduled), each with its time,
  type, frequency, and state, and a way to go to it.
- **EVT-011:** The page MUST offer to create a new activity in the event (the
  New Activity form, already set to it) and to add an existing activity that
  isn't in an event. An activity MUST be removable from the event, which keeps
  the activity.

## Activities

- **EVT-020:** The activity form MUST offer an **Event** choice, defaulting to
  none, only when at least one event exists, and never for a station log.
  Moving an activity into or out of an event MUST be recorded in its history.
- **EVT-021:** The sidebar MUST show each event's activities together as their
  own group, named after the event, in the order they run; an event with an
  activity not yet closed first, a finished one after Closed and folded by
  default. Its activities MUST NOT also appear in the other groups.

## What's next

- **EVT-030:** When ending an activity in an event, the End net window MUST
  say which activity in the event is next (the soonest scheduled that hasn't
  started, else one with no time) and when. Only within 15 minutes of its
  scheduled time, or once it's due, MUST it offer to start it, so it isn't
  started early by accident. Starting it MUST NOT end the current one; once
  the window closes, the next one is selected.

## Forms for the whole event

- **EVT-040:** An event's page MUST offer an **ICS 309** covering the whole
  event: every activity's log lines merged in time order, each check-in
  addressed to whoever ran that activity and relayed messages logged in and
  out (`RELAY-041`), with a checklist to leave activities out. The header
  MUST default to the event's name and the default operator, and stay
  editable. Each activity's own ICS 309 stays in its Exports & forms.
- **EVT-041:** The ICS 214 activity log MUST be reached from the Events tab
  only. An event's page opens its log: the one saved for it if there is one,
  else a new one named after the event, covering its span, with any other
  activities in that span left out. All logs, including any not tied to an
  event, MUST stay reachable from the Events tab. An activity's Exports &
  forms MUST say
  where they are.

## Acceptance examples

```gherkin
Scenario: Setting up an exercise
  Given the operator creates the event "ARRL 2026 SET" on the Events tab
  When they add Ham net 09:00, GMRS net 09:30, and HF relays 10:30 from its page
  Then the event's page and the sidebar list them in that order

Scenario: Running it
  When the operator ends the Ham net at 09:25
  Then the window says GMRS net is next at 09:30 and offers to start it
  When the operator ends the GMRS net at 09:55
  Then the window says HF relays is next at 10:30 (in 35 min), without offering to start it yet

Scenario: Reporting on it
  Given the exercise's activities have check-ins and relayed messages
  When the operator opens the event's ICS 309
  Then every entry from all of them is in one log, oldest first
  When the operator opens the event's ICS 214
  Then it is named after the event and covers its times

Scenario: Not using events
  Given no events exist
  Then the New Activity form has no Event choice
```
