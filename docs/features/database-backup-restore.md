# Feature: Database Backup and Restore

## Status

Draft — implemented.

## Purpose

Everything an operator records lives in one local database
([ADR-002](../decisions/ADR-002-offline-first-storage.md)). A single-file
backup lets them protect it, move it to another computer, and undo a bad
change, without touching files by hand.

## Relationship to other documents

- Preserves the records and history defined in
  [07-time-audit-and-record-history.md](../07-time-audit-and-record-history.md)
  (`AUDIT-*`).
- Lives in Settings ([06-application-shell-and-navigation.md](../06-application-shell-and-navigation.md)).

## What is backed up

- **BACKUP-001:** A backup MUST contain the whole application database:
  operators, activities, the repeater directory, net listings, saved places, ICS 214 activity logs, check-ins, spotter reports, relayed messages,
  the traffic noted on check-ins, and the audit history, including removed
  records.
- **BACKUP-002:** A backup MUST NOT contain downloaded offline data (road
  packs, the call-sign directory), application settings, or the QRZ
  credentials. Excluding credentials keeps backup files safe to copy and
  share.
- **BACKUP-003:** A backup MUST be one self-contained file, consistent even
  though the application is running.

## Backing up

- **BACKUP-010:** Settings MUST offer a "back up now" action that asks where
  to save the file, proposing a name that includes the date and time.
- **BACKUP-011:** The action MUST refuse to write over the application's own
  database, and MUST replace an existing file only after the operating
  system's save dialog has confirmed it.
- **BACKUP-012:** After a backup, the interface MUST show what was saved
  (counts of operators, activities, check-ins, and spotter reports) and where.
- **BACKUP-013:** Settings SHOULD show when the last backup was made on this
  computer, or that there has been none.

## Restoring

- **BACKUP-020:** Settings MUST offer a "restore" action that asks for a
  backup file.
- **BACKUP-021:** Before changing anything, the application MUST check the
  file: it MUST be one of this application's databases and MUST NOT have been
  made by a newer version. Anything else MUST be refused with a readable
  message, leaving all data unchanged.
- **BACKUP-022:** The operator MUST be shown what the file contains
  (counts and when it was saved) and MUST explicitly confirm, with a plain
  statement that everything currently in the application will be replaced
  (`PERSONA-009`).
- **BACKUP-023:** Before replacing anything, the application MUST save a
  copy of the current data in a `backups` folder next to the database, and
  MUST tell the operator where. It MUST keep the five most recent such
  copies and remove older ones.
- **BACKUP-024:** A backup made by an older version of the application MUST
  be brought up to date after restoring, using the normal migrations
  (`STORAGE-*`).
- **BACKUP-025:** After a successful restore the interface MUST reload, so
  nothing on screen reflects the replaced data.
- **BACKUP-026:** The application MUST refuse to restore from its own live
  database file.

## Upgrades

- **BACKUP-030:** Each database migration MUST be applied all or nothing: a
  migration that fails partway MUST leave the database as it was, so the
  next launch can apply it again.
- **BACKUP-031:** Before a new version upgrades an existing database, it MUST
  save a copy of it in the same `backups` folder (`before-upgrade-…`),
  keeping the five most recent such copies. A brand-new database needs no
  copy. If the copy can't be saved, the upgrade still goes ahead.
- **BACKUP-032:** After an upgrade, the application MUST tell the operator
  once where the copy was saved, or that saving it failed. These copies are
  listed and can be cleared with the restore safety copies (Settings →
  Storage).

## Acceptance examples

```gherkin
Scenario: Undoing recent work with a backup
  Given the operator made a backup, then logged more check-ins
  When they restore the backup and confirm
  Then the later check-ins are gone
  And a copy of the data before the restore was saved

Scenario: Refusing the wrong file
  Given a file that is not a backup of this application
  When the operator chooses it to restore
  Then an explanation is shown
  And nothing changes

Scenario: A backup from a newer version
  Given a backup made by a newer version of the application
  When the operator chooses it to restore
  Then the operator is told to update the application first
  And nothing changes
```
