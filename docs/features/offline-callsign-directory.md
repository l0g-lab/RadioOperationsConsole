# Feature: Offline Call-Sign Directory

## Status

Draft — implemented for U.S. call signs, from the FCC.

## Purpose

Call-sign enrichment normally comes from QRZ
([qrz-callsign-enrichment.md](qrz-callsign-enrichment.md)), which needs
internet and a subscription. When that is unavailable — in the field, or for
operators who don't subscribe — a downloadable copy of the FCC's public
amateur-license records fills in a check-in's name and address instead, so
rapid check-in still works.

## Relationship to other documents

- A fallback beneath QRZ; it never replaces or outranks it (`CALLDIR-020`).
- Location is derived at ZIP level using [location-resolution.md](location-resolution.md).
  No address is geocoded.
- Downloaded on demand from Settings, alongside the road data in
  [mile-marker-lookup.md](mile-marker-lookup.md), and excluded from
  database backups ([database-backup-restore.md](database-backup-restore.md)).
- Governed by the offline-first and online-add-on boundaries in
  [02-scope-and-release-boundaries.md](../02-scope-and-release-boundaries.md).

## Principles

- **CALLDIR-001:** The directory MUST NOT be bundled with the application.
  It is an optional download so the installed package stays small.
- **CALLDIR-002:** The application MUST download the file directly from the
  FCC's public bulk-data service (Universal Licensing System, amateur
  license file). This project MUST NOT host or redistribute it.
- **CALLDIR-003:** The feature MUST NOT geocode addresses. Doing so would
  send bulk requests to third-party services; the location it provides is
  ZIP-level only (`CALLDIR-024`).

## The file

- **CALLDIR-010:** From the FCC download, the application MUST build one
  record per *active* license, joining license status to licensee details by
  the license's identifier rather than by call sign, so a call sign's old
  expired license cannot shadow its current one.
- **CALLDIR-011:** Each record MUST hold call sign, licensee name, street
  address (or PO box), city, state, and ZIP.
- **CALLDIR-012:** The built file MUST be compact (compressed, sorted, and
  indexed for binary search), versioned, and MUST record when it was built
  and its source. Older file versions MUST continue to load; a version that
  predates street addresses MUST be identified so the interface can tell the
  operator to update it.
- **CALLDIR-013:** The format MUST reserve room for coordinates so that
  geocoded positions could be added later without breaking existing files.
- **CALLDIR-014:** The file MUST load lazily on first lookup rather than at
  startup, since it is large once unpacked.
- **CALLDIR-015:** Lookups MUST be exact by call sign, case-insensitive,
  and answer in well under a second once loaded.

## Using it at check-in

- **CALLDIR-020:** The directory MUST be consulted only when QRZ is not
  available for the lookup (not configured, offline, or failing). When QRZ
  returns a result, the QRZ result MUST be used. A call sign QRZ was
  reachable for but does not know MUST be reported as not found, without
  consulting the directory.
- **CALLDIR-021:** A hit MUST fill the name and the full address
  (`street, City, ST ZIP`), and the QTH as `City, ST`, but MUST NOT overwrite
  fields the operator has already filled.
- **CALLDIR-022:** The interface MUST label where the values came from
  ("FCC record (offline)") and MUST say when the call sign is not in the
  file.
- **CALLDIR-023:** When the installed file predates street addresses, the
  check-in form MUST say so, rather than silently showing a shorter address.
- **CALLDIR-024:** The check-in's map location from this source MUST be the
  ZIP centroid, resolved offline (`LOCRES-*`), and MUST be presented as an
  estimate.
- **CALLDIR-025:** The retry-lookup action on the roster MUST use the same
  QRZ-then-directory order and MUST be labeled by the source it will use.

## Downloading

- **CALLDIR-030:** Settings MUST show whether the file is installed, how many
  licensees it holds, its size, and when it was built, and MUST offer
  download, update, and remove.
- **CALLDIR-031:** Because the download is large (about 200 MB), the
  interface MUST ask for confirmation first and say roughly how large and
  long it is.
- **CALLDIR-032:** The download MUST report progress (downloading, reading,
  saving) and MUST NOT block the rest of the application.
- **CALLDIR-033:** An interrupted download MUST resume where it stopped when
  the server still has the same version of the file (checked so half of an
  old file is never joined to a newer one), and MUST otherwise restart.
- **CALLDIR-034:** A stalled connection MUST time out with a message telling
  the operator that running the update again picks up where it left off.
- **CALLDIR-035:** Only one download MAY run at a time.
- **CALLDIR-036:** A failed or offline update MUST leave any installed file
  unchanged.

## Non-goals

- Non-U.S. call signs.
- Daily incremental FCC updates (the full file is re-downloaded to update).
- Geocoding street addresses to coordinates.

## Acceptance examples

```gherkin
Scenario: Offline check-in with the FCC file
  Given the FCC file is installed and there is no internet connection
  When the operator enters a call sign found in the file
  Then the name, address, and QTH are filled in
  And the source is shown as "FCC record (offline)"
  And the map location is the ZIP centroid

Scenario: QRZ wins when it works
  Given QRZ is configured and reachable and the FCC file is installed
  When the operator enters a call sign
  Then the QRZ result is used

Scenario: An old-format file
  Given the installed file was built before street addresses were included
  When the operator looks up a call sign
  Then the form explains the street address is missing and how to update the file
```
