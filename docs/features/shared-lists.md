# Feature: Sharing Repeater and Net Lists

## Status

Draft — implemented.

## Purpose

Operators in one area use the same repeaters and join the same nets. Rather
than each typing them in, one operator can export their repeaters or their
nets to a file and hand it to others, who import it into their own copy of
the app. It works like a backup ([database-backup-restore.md](database-backup-restore.md)),
but for one list at a time, and an import only ever adds.

## Relationship to other documents

- Lists the repeater directory ([repeater-directory.md](repeater-directory.md))
  and net listings ([net-listings.md](net-listings.md)).
- A list file is not a backup, and a backup is not a list file (`BACKUP-021`).

## Exporting

- **SHARE-001:** The Repeaters panel MUST offer "Export repeaters…" and the
  Nets tab "Export nets…", each asking where to save the file and proposing a
  name with the date ("Nets 2026-10-07.db"). They sit below the list, as
  something done now and then.
- **SHARE-002:** A list MUST be one file holding only the text of the
  repeaters or nets in use: no retired ones, no history, no ids, and nothing
  else from the app. Repeaters and nets are separate files.
- **SHARE-003:** A net MUST NOT carry a link to a repeater. A net on a
  repeater MUST be written with the repeater's name and one-line form as its
  frequency text ("W4ABC Orlando 146.940 -0.600 PL 100.0"), so whoever imports
  it can read it and link it to a repeater of their own if they want.
- **SHARE-004:** Export MUST refuse to write over the app's own database.

## Importing

- **SHARE-010:** The same places MUST offer "Import repeaters…" and "Import
  nets…", asking for a file.
- **SHARE-011:** Before changing anything, the app MUST check the file is a
  list of that kind made by this app, and not by a newer version. A net list
  chosen to import as repeaters (or the reverse), a backup, or any other file
  MUST be refused with a readable message.
- **SHARE-012:** The operator MUST be shown what the import will do ("Adds 3
  nets. 2 already here are left as they are.") and when the list was made,
  and MUST confirm it.
- **SHARE-013:** Importing MUST only add. A repeater with the same name and
  output frequency as one in use, or a net with the same name, is already
  here and MUST be left as it is, so nothing the operator entered, edited or
  linked is changed. Entries repeated within the file are added once.
- **SHARE-014:** Every entry MUST be checked as if typed in by hand
  (`RPT-001`–`004`, `NETL-001`–`005`). One that doesn't pass is skipped and
  counted, and the rest are imported.
- **SHARE-015:** An import MUST be all or nothing, and each entry it adds
  MUST be recorded in the history, like one added by hand.

## Not in scope

- Other programs' formats (CHIRP and the like).
- Updating or removing entries from an import.
- One file holding both repeaters and nets.
