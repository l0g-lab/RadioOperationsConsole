# Feature: Settings

## Status

Draft — implemented.

## Purpose

Settings holds the few choices the operator makes once — how the app looks,
optional online accounts — and the data this computer keeps so the app works
offline. It should read at a glance, save without a button to forget, and
list each kept thing once.

## Relationship to other documents

- Offline data: the FCC call-sign directories
  ([offline-callsign-directory.md](offline-callsign-directory.md)), mile-marker
  road data ([mile-marker-lookup.md](mile-marker-lookup.md)), and storage on
  this computer ([local-storage.md](local-storage.md), `STORE-*`).
- Online services: QRZ.com ([qrz-callsign-enrichment.md](qrz-callsign-enrichment.md))
  and the NWS ([nws-alerts.md](nws-alerts.md)). The weather area is set on the
  Weather tab, not here.
- Backup and restore ([database-backup-restore.md](database-backup-restore.md)).

## Layout

- **SET-001:** Settings MUST be laid out in two columns, like the Operations
  tab: the operator's preferences on the left (**Appearance**, **Online
  services**), this computer's data on the right (**Offline data**, **Backup &
  Restore**), each a panel with one heading and its ⓘ explanation; then one
  line for the app's version, license, project link, and *Check for updates*.

## Saving

- **SET-020:** Every setting MUST save as it's changed: Appearance at once, an
  online service's box on leaving it (only if it changed), with a brief
  "Saved". There is no Save button, no unsaved-changes state, and no "Reset to
  defaults" (it would wipe the QRZ login for no benefit).

## Offline data

- **SET-030:** Everything kept for offline use MUST be in one list — the
  amateur and GMRS call-sign files, the mile-marker roads (each road listed
  under *Show roads*), road updates, map tiles, unfinished downloads, and
  safety copies — each on one row with its icon, its status and size (when
  downloaded or updated, how big), and its buttons (Download, Update, Remove or
  Clear), then the total of everything (`STORE-001`–`STORE-002`).

## Backup

- **SET-040:** The time of the last backup MUST be shown, in amber when there
  has never been one or the last was over 30 days ago.
