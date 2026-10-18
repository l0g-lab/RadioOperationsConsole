# Feature: Relay Station

## Status

Draft — implemented.

## Purpose

During an exercise or an emergency, a station is often assigned to relay:
traffic arrives from one station — a shelter's situation report, say — and
must be moved on to another, often on a different frequency or by another
means altogether. What the relay operator needs at a glance is what they are
still holding and for whom; afterwards, what came in, where it went, how, and
what couldn't be delivered. A relay station is an activity type for that,
replacing the clipboard. The traffic is informal (situation reports and the
like), so this is a log of messages, not a formal traffic-handling system.

## Relationship to other documents

- An activity type alongside those in
  [activity-lifecycle-and-wrap-up.md](activity-lifecycle-and-wrap-up.md)
  (`LIFE-050`–`056`), [station-log.md](station-log.md), and
  [range-check.md](range-check.md). It is started and ended like a net
  (`LIFE-001`–`007`).
- Its records are relay messages rather than check-ins, kept with the same
  attributed history, removal and restore, closed-activity protection, and
  backup as other records ([07-time-audit-and-record-history.md](../07-time-audit-and-record-history.md)).
- Feeds the ICS 309 and ICS 214 ([ics-form-exports.md](ics-form-exports.md))
  and the exports ([activity-exports.md](activity-exports.md)).
- Also holds a net check-in's traffic (`RELAY-050`–`052`,
  [weekly-net-operations.md](weekly-net-operations.md), `NETOPS-050`–`056`).
- Not covered: message numbering, precedence, radiogram or ICS 213 message
  formats, routing, and sending one message to several stations at once (log
  it once per destination).

## The type

- **RELAY-001:** There MUST be a "Relay station" activity type, selectable
  wherever a type is chosen. On it, the Check-ins tab becomes **Messages**,
  and starting and ending say "relay" instead of "net".
- **RELAY-002:** A relay station takes no check-ins. Its summaries MUST show
  its messages — how many, passed, still held, and not passed — and MUST NOT
  show an empty check-in count.

## Logging a message

- **RELAY-010:** The operator MUST be able to log a message as it arrives
  with: the time received (blank means now), *from* (a call sign or tactical
  name), *for* (where it is going), how it was received (a frequency,
  repeater, or other means; defaulting to the activity's frequency, and then
  to how the last message came in), and the message text or a summary. From,
  for, and the message MUST be given.
- **RELAY-011:** A logged message MUST be correctable and removable (with an
  optional reason) and restorable, each recorded in the history.
- **RELAY-012:** The from, for, and passed-to boxes MUST suggest, as you
  type, the stations and tactical names already named in this relay, and the
  received-via and passed-via boxes the ways already used (the activity's
  frequency, earlier ones, phone, Winlink, JS8Call, RTTY, PSK31, FT8, in person, runner). Tab or Enter
  fills in the highlighted one, in the app's own suggestion list.

## Passing it on

- **RELAY-020:** A message MUST stay in a **To pass** list, oldest first,
  until it is passed on or given up on.
- **RELAY-021:** For a held message the operator MUST be able to record:
  - **Attempt failed:** when, how it was tried (required), who was tried, and
    what happened. The message stays held.
  - **Passed:** when, to whom (defaulting to the message's *for*), and how
    (required) — a frequency, a repeater, or another means such as phone,
    Winlink, a runner, or in person.
  - **Couldn't pass:** when, and why (required).
  Times default to now and cannot be before the message was received. Ways
  already used in the activity MUST be offered as choices.
- **RELAY-022:** Once a message is passed or given up on, no further step MUST
  be accepted until that outcome is undone.
- **RELAY-023:** Any step MUST be undoable, for a mistake. An undone step
  leaves the log but stays in the history.

## Replies

- **RELAY-030:** For a message that's been dealt with, the operator MUST be
  able to log a reply: a new message with *from* and *for* swapped, linked to
  the original. A message MUST show the replies logged to it, and a reply what
  it answers. Replies are optional; nothing asks for one.

## Ending

- **RELAY-035:** Ending a relay with messages still held MUST warn how many,
  without preventing it. The activity summary MUST say the same.

## Output

- **RELAY-040:** The messages MUST be exportable as CSV, one row per message:
  received time (local and UTC), from, for, received via, the message, what it
  replies to, status, when, to whom, and how it was passed, failed attempts,
  and why it wasn't passed.
- **RELAY-041:** The ICS 309 for a relay station MUST log each message as it
  came in (from the sender to this station), each failed attempt ("Unable to
  pass via …"), each passing on (from this station to whom it was passed, the
  message followed by how: "… (via RTTY)"), and each given up on ("Not passed
  to EOC: why", from this station with To left blank), oldest first.
- **RELAY-042:** Filling an ICS 214 MUST add a line for each message passed
  ("Relayed message from Shelter 2 for EOC via Phone"), each failed attempt,
  and each message given up on, within the period; and the closing line MUST
  give the relay's counts rather than check-ins.

## Traffic on a check-in

Traffic doesn't wait for the right activity type. A station checking in to a
net has traffic, or the operator joins a net as an ordinary station and
takes some; it may arrive by voice and leave by JS8Call, RTTY, or another
mode. Traffic is kept one way: a check-in's traffic is a message like a
relay's, so it is passed on, tried, or given up on the same way. Entering it
stays as quick as before, and nothing more is shown until the operator goes
looking for it.

- **RELAY-050:** Traffic typed on a net check-in (`NETOPS-051`) MUST be kept
  as a message linked to that check-in: from its call sign, received when it
  checked in, via the activity's frequency, with *for* left blank. Its text
  and sender are changed on the check-in (`NETOPS-052`), not as a message;
  clearing the traffic removes it, with what was done to pass it on, so
  traffic typed again starts afresh. A removed check-in's traffic goes and
  comes back with it. A note from net control (`NETOPS-060`) is never traffic.
  Traffic noted on check-ins by an earlier version MUST become such messages
  on upgrade, those marked handled passed when they were last marked.
- **RELAY-051:** Logging a check-in with traffic MUST take no more than it did
  before: the call sign, the traffic, Enter. The Handled box (`NETOPS-054`)
  stays the one-click way to settle it, and records it passed without asking
  to whom or how. Only traffic passed on is handled: traffic that couldn't be
  passed leaves the box unticked and still counts as not handled at the end of
  the net (`NETOPS-056`); ticking it then records it passed after all. Selecting the check-in MUST show its traffic with what has
  been done to pass it on, and offer Passed, Attempt failed, and Couldn't pass
  as for a relay (`RELAY-021`), with every step undoable (`RELAY-023`). For a
  check-in's traffic, Passed MAY leave out to whom and how. The row MUST say,
  beside Handled, where it went ("→ EOC via RTTY"), that it wasn't passed, or
  how many attempts have failed, when there's any of that to say.
- **RELAY-052:** A check-in's traffic counts as its traffic in the summary
  (`NETOPS-056`), never as relayed messages. Its check-in's line on the ICS
  309 is it coming in; each failed attempt, each passing on to a named
  station, and giving up on it adds a line, as for a relay (`RELAY-041`).
  Ticked Handled with no station named adds none: there's no one to put in To. On the ICS 214, passing
  it on is "Handled traffic from …", with to whom and how when given
  (`RELAY-042`). A net's Exports & forms MUST offer its traffic as CSV, in the
  relay's columns (`RELAY-040`).

## Acceptance examples

```gherkin
Scenario: Traffic that fails on HF and goes by phone
  Given a relay station has logged a sitrep from Shelter 2 for the EOC
  When the operator records a failed attempt via 7.240 HF
  Then the sitrep is still in To pass, with the failed attempt shown
  When the operator records it passed to the EOC via Phone
  Then it moves to Done
  And the ICS 309 shows it received, the failed attempt, and it passed to the EOC (via Phone)

Scenario: Traffic that can't be delivered
  Given a held message for Shelter 2
  When the operator records it couldn't be passed because Shelter 2 is off the air
  Then it is marked not passed, with the reason
  And the ICS 214 says the message was not passed and why

Scenario: Taking traffic on a net, and passing it on digitally
  Given the operator joins a MARS net as an ordinary station
  When they log AAA4XX with the traffic "Sitrep for EOC" and press Enter
  Then the row shows the traffic with an unticked Handled box, and nothing more is asked
  When they select the row and record an attempt failed via JS8Call
  Then the row says "1 failed attempt" and the traffic is still held
  When they record it passed to AAA9GW via RTTY
  Then the row shows Handled ticked and "→ AAA9GW via RTTY"
  And the ICS 309 has the check-in, the failed attempt, and the passing on

Scenario: The quick way still works
  Given a check-in with traffic
  When the operator ticks Handled
  Then it's recorded as passed, now, with nothing more asked

Scenario: Ending with traffic still held
  Given one message still held
  When the operator ends the relay
  Then they are warned that one message is still waiting to be passed on
  And can end it anyway
```
