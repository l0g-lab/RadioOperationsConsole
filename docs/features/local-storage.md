# Feature: Local Storage

## Status

Draft — implemented.

## Purpose

The application keeps copies of downloaded and cached data on this computer
so it works offline. Operators need to see what is there and how much space it
takes, and to clear it — to free space, to force a fresh download, or before
handing the computer to someone else.

## Relationship to other documents

- Lists the files kept by [offline-callsign-directory.md](offline-callsign-directory.md),
  [mile-marker-lookup.md](mile-marker-lookup.md), the map tile cache in
  [checkin-location-map.md](checkin-location-map.md) (`CIMAP-050`), and the
  restore safety copies in [database-backup-restore.md](database-backup-restore.md).
- Does not cover the operational database itself, settings, or display
  preferences; those are the operator's records and choices, not caches.
  Erasing records is the permanent-deletion workflow (`AUDIT-007`).

## Requirements

- **STORE-001:** Settings MUST list what the application keeps on this computer
  beyond its records — cached map tiles, the amateur and GMRS call-sign files,
  updated mile-marker road data, unfinished downloads, and "before restore"
  safety copies — in the one Offline data list (`SET-030`), each once.
- **STORE-002:** Each item MUST show its size and how many files or tiles it
  holds, and the list MUST show the total of everything. An item with nothing
  stored is left out, except map tiles (which say "Nothing stored"); the
  call-sign files always have their row, saying "Not downloaded".
- **STORE-003:** Each item MUST be clearable on its own, after a confirmation
  that says what clearing it means for offline use (for example, that map areas
  will be blank offline until visited again online). There is no single
  "clear everything" action.
- **STORE-004:** Clearing MUST take effect at once, without a restart: a
  cleared call-sign file is no longer used for lookups, and cleared road data
  falls back to the copy built into the application.
- **STORE-005:** Clearing call-sign files or unfinished downloads MUST be
  refused while a call-sign download is running.
- **STORE-006:** Clearing MUST remove only that item's files: never the
  database, settings, or files the application didn't create.
- **STORE-007:** Measuring sizes MUST NOT use the network and MUST NOT block
  the rest of the application.
