# Feature: Activity Templates

## Status

Draft — implemented.

## Purpose

Weekly and bi-weekly nets are created again and again with the same title,
start time, frequency, and often the same location. A template keeps those
recurring details so starting the next occurrence is a choice, not a
re-typing exercise.

## Relationship to other documents

- Applies to the activities described in
  [weekly-net-operations.md](weekly-net-operations.md) (`NETOPS-*`) and the
  Operations tab in [06-application-shell-and-navigation.md](../06-application-shell-and-navigation.md)
  (`UX-OPS-*`).
- Distinct from the event templates of
  [05-event-and-template-model.md](../05-event-and-template-model.md)
  (`TEMPLATE-*`), which define what *kind* of activity something is and which
  features it enables. An activity template here is only a saved set of
  starting values for the creation form; it never changes an activity's
  behavior.
- Locations use the picker and coordinate model in
  [location-resolution.md](location-resolution.md).

## What a template holds

- **ACTTPL-001:** A template MUST hold a unique name (compared without regard
  to case), an activity title, an activity type
  ([activity-lifecycle-and-wrap-up.md](activity-lifecycle-and-wrap-up.md),
  `LIFE-050`), and MAY hold a start time (`HH:MM`), a
  frequency, and a location (label plus coordinates).
- **ACTTPL-002:** A template MUST NOT hold a date. Every activity started from
  a template takes the day it is created, so a template never goes stale.
- **ACTTPL-003:** Templates MUST be stored in the application database
  (`STORAGE-*`) so they persist across restarts and are included in database
  backups ([database-backup-restore.md](database-backup-restore.md)).

## Creating templates

- **ACTTPL-010:** The operator MUST be able to save the selected activity as
  a template. This captures its title, start time, frequency, and location.
- **ACTTPL-011:** The operator MUST be able to save the values in the
  create-activity form as a template. This captures the title, type, time,
  and frequency only, never a location.
- **ACTTPL-012:** Saving under a name that already exists MUST replace that
  template rather than create a near-duplicate, and the interface MUST say
  so before the operator confirms. When the replacement comes from the
  create-activity form (`ACTTPL-011`), the replaced template MUST keep the
  location it already had.
- **ACTTPL-013:** A template MUST have a non-empty name and title.

## Using templates

- **ACTTPL-020:** The create-activity form MUST offer a "start from a
  template" choice whenever any template exists. Choosing one MUST fill the
  title, time, and frequency, leave the date on today, and, when the
  template has a location, use that location for the new activity.
- **ACTTPL-021:** The templates list MUST offer a "Use template" action per
  template that opens the create-activity form (even if collapsed), fills it
  as in `ACTTPL-020`, and brings it into view.
- **ACTTPL-022:** Filling the form from a template MUST NOT create anything;
  the operator still confirms with the normal create action, and MAY change
  any value first.

## Managing templates

- **ACTTPL-030:** The Operations tab MUST show a templates list (collapsed
  by default) where the operator can edit and delete templates.
- **ACTTPL-031:** Editing MUST allow changing the name, title, time,
  frequency, and location, including clearing the location. Renaming to a
  name another template already uses MUST be refused with a readable
  message.
- **ACTTPL-032:** Deleting MUST require explicit confirmation.
- **ACTTPL-033:** Editing or deleting a template MUST NOT change any activity
  previously created from it.

## Location on new activities

Template location is part of a broader rule for the create-activity form.

- **ACTTPL-040:** The create-activity form MUST let the operator choose a
  location with the shared location picker.
- **ACTTPL-041:** When no location is chosen, the new activity MUST default
  to the acting operator's own location, copied onto the activity when it is
  created. If the operator has no location either, the activity has none.
- **ACTTPL-042:** Failing to apply the location MUST NOT prevent the activity
  from being created.

## Acceptance examples

```gherkin
Scenario: Starting next week's net from a template
  Given a template "Tuesday Net" with time 19:00, frequency 146.940, and a location
  When the operator chooses it in the create-activity form and creates the activity
  Then the new activity has that title, time, frequency, and location
  And its date is today

Scenario: Replacing a template from the form keeps its location
  Given a template "Tuesday Net" with a saved location
  When the operator saves the form's values as "tuesday net"
  Then the title, time, and frequency are updated
  And the template still has its location

Scenario: Default location
  Given the acting operator has a location and no location is chosen
  When an activity is created
  Then the activity's location is the operator's location
```
