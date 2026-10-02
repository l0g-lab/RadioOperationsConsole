# Event and Template Model

## Common activity engine

An activity is the top-level operational container. It owns or references net sessions, operational periods, check-ins, activity entries, traffic, incidents, reports, assignments, alerts, APRS watches, and generated artifacts.

## Initial activity types

- `weekly_net`
- `directed_net`
- `ares_races_activation`
- `skywarn_activation`
- `set_exercise`
- `training`
- `public_service`
- `custom`

An activity type supplies defaults; it does not limit the records an authorized operator may add.

Implemented so far: simple net, directed net, SKYWARN, other (see [features/activity-lifecycle-and-wrap-up.md](features/activity-lifecycle-and-wrap-up.md), `LIFE-050`–`056`), station log, a running contact log with no lifecycle (see [features/station-log.md](features/station-log.md)), and range check, a net for testing a repeater's reach whose check-ins must each give a map point, station details and signal reports both ways (see [features/range-check.md](features/range-check.md)). The remaining types are added as the features that distinguish them are built.

## Lifecycle

`draft -> scheduled -> active -> suspended -> active -> closed -> archived`

Implemented so far: `scheduled -> active -> closed`, and reopening
(see [features/activity-lifecycle-and-wrap-up.md](features/activity-lifecycle-and-wrap-up.md)).
`draft` and `suspended` are not yet built.

- **EVENT-001:** Only valid lifecycle transitions MUST be accepted.
- **EVENT-002:** Every transition MUST record local display time, canonical UTC time, operator, prior state, new state, and optional reason.
- **EVENT-003:** Closing an activity MUST warn about unresolved traffic, reports requiring disposition, and incomplete assignments.
- **EVENT-004:** Reopening a closed activity MUST require a reason and create an audit event.
- **EVENT-005:** Archiving MUST hide an activity from normal active views without deleting it.

## Multiple open activities

- **EVENT-006:** The application MUST permit several activities to remain open.
- **EVENT-007:** Exactly one activity MAY be focused at a time.
- **EVENT-008:** The persistent header and tab content MUST clearly identify the focused activity.
- **EVENT-009:** Background activities MUST indicate important state changes without stealing keyboard focus.
- **EVENT-010:** New records created from an activity tab MUST be associated with the focused activity unless the operator explicitly selects another one.

## Activity types

An activity's behavior comes from its type (`src/activityTypes.ts`), not from
saved templates. (The `TEMPLATE-*` IDs below keep their original prefix so
existing references stay valid.) A type defines, or will define:

- Enabled and emphasized tabs and summary sections
- Whether it has a lifecycle (a station log does not)
- Check-in fields and which are required (as a range check does)
- Traffic workflow
- Available report types
- Closeout checklist

Recurring details of a particular net — its title, repeater, day and time,
and opening and closing scripts — belong to net listings ([features/net-listings.md](features/net-listings.md)), not to
the type. Saved activity templates were removed in favor of the repeater
directory and net listings.

- **TEMPLATE-001:** Changing an activity's type MUST NOT hide or remove records it already has.
- **TEMPLATE-004:** The product MUST ship simple-net, directed-net, SKYWARN, and other types, and SHOULD add ARES/RACES-activation and SET-exercise types once the features that distinguish them exist.
- **TEMPLATE-005:** The directed-net type SHOULD emphasize check-ins, announcements, traffic, and conclusion while hiding complex incident tools by default.
- **TEMPLATE-006:** Hidden modules MUST remain available through activity configuration when operationally necessary.

## Weekly directed-net baseline

The step-by-step weekly directed-net procedure (opening through closing) and
its check-in requirements are specified in
[features/weekly-net-operations.md](features/weekly-net-operations.md), which
is the canonical home for activity-type-specific procedure detail. This
document defines only the cross-activity engine and activity-type rules above.

