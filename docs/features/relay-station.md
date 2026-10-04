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
  pass via …"), and each passing on (from this station to whom it was passed),
  oldest first.
- **RELAY-042:** Filling an ICS 214 MUST add a line for each message passed
  ("Relayed message from Shelter 2 for EOC via Phone"), each failed attempt,
  and each message given up on, within the period; and the closing line MUST
  give the relay's counts rather than check-ins.

## Acceptance examples

```gherkin
Scenario: Traffic that fails on HF and goes by phone
  Given a relay station has logged a sitrep from Shelter 2 for the EOC
  When the operator records a failed attempt via 7.240 HF
  Then the sitrep is still in To pass, with the failed attempt shown
  When the operator records it passed to the EOC via Phone
  Then it moves to Done
  And the ICS 309 shows it received, the failed attempt, and it passed to the EOC

Scenario: Traffic that can't be delivered
  Given a held message for Shelter 2
  When the operator records it couldn't be passed because Shelter 2 is off the air
  Then it is marked not passed, with the reason
  And the ICS 214 says the message was not passed and why

Scenario: Ending with traffic still held
  Given one message still held
  When the operator ends the relay
  Then they are warned that one message is still waiting to be passed on
  And can end it anyway
```
