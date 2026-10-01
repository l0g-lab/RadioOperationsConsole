# Feature: Offline Call-Sign Directory

## Status

Draft — implemented for U.S. amateur and GMRS call signs, from the FCC.

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
  ("FCC amateur record (offline)" or "FCC GMRS record (offline)") and MUST say
  when the call sign is not in the file.
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
  interface MUST say roughly how large and long it is next to the download
  control, before it is clicked. One click MUST start it; there is no
  separate confirmation step.
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
- **CALLDIR-037:** A running download MUST be cancellable. Cancelling MUST
  keep what has arrived so running it again resumes (`CALLDIR-033`), and MUST
  leave any installed file unchanged.

## GMRS licenses

GMRS (General Mobile Radio Service) operators often take part in the same
events as amateurs — SKYWARN, ARES and CERT activations in particular — and
check in with a GMRS call sign. The FCC publishes GMRS licenses in the same
bulk format as amateur ones (`l_gmrs.zip`, about 55 MB, updated weekly), so
GMRS gets its own directory built the same way.

- **CALLDIR-040:** The GMRS directory MUST be a separate, optional download
  from the FCC's GMRS license file, built, stored, updated, and removed
  independently of the amateur directory. Every rule above for the amateur
  file (`CALLDIR-001`–`CALLDIR-015`, `CALLDIR-030`–`CALLDIR-037`) applies to it
  as well, with its own size stated next to its download control (`CALLDIR-031`).
- **CALLDIR-041:** Which directory answers MUST be decided per call sign, from
  its shape, not by the activity or its type: an activity may mix amateur and
  GMRS stations. After removing spaces and any `/` suffix (portable, mobile,
  or unit numbers such as `WRAB123/2`):
  - **GMRS:** three or four letters followed by three or four digits
    (`WRAB123`, `KAE1234`). U.S. GMRS call signs always end in digits.
  - **Amateur:** one or two letters, one digit, and one to three letters
    (`W1AW`, `KD8XYZ`). U.S. amateur call signs always end in a letter.
  - **Unknown:** anything else.
- **CALLDIR-042:** A GMRS call sign MUST be looked up only in the GMRS
  directory. QRZ and the amateur directory MUST NOT be consulted for it, since
  they hold amateur licenses only.
- **CALLDIR-043:** Amateur and unknown call signs MUST keep the existing order:
  QRZ, then the amateur directory (`CALLDIR-020`).
- **CALLDIR-044:** When a GMRS call sign is entered and the GMRS directory is
  not installed, the check-in form MUST say that GMRS lookup needs the GMRS
  file from Settings, rather than reporting the call sign as not found.
- **CALLDIR-045:** One GMRS license covers the licensee's immediate family, so
  the person checking in may not be the licensee. The interface MUST label a
  GMRS name as the licensee's, and MUST NOT overwrite a name the operator has
  already entered (`CALLDIR-021`).
- **CALLDIR-046:** Location from a GMRS record follows the same ZIP-level rule
  as an amateur record (`CALLDIR-024`).

## Non-goals

- Non-U.S. call signs.
- A per-activity radio service (amateur, GMRS, mixed). Lookups don't need it
  (`CALLDIR-041`); it may be added later for labelling and exports.
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

Scenario: A GMRS check-in
  Given the GMRS file is installed and QRZ is configured
  When the operator enters "WRAB123"
  Then the GMRS file is searched and QRZ is not
  And the name is labelled as the licensee's
  And the source is shown as "FCC GMRS record (offline)"

Scenario: GMRS file not installed
  Given the GMRS file is not installed
  When the operator enters "WRAB123"
  Then the form says GMRS lookup needs the GMRS file from Settings

Scenario: An old-format file
  Given the installed file was built before street addresses were included
  When the operator looks up a call sign
  Then the form explains the street address is missing and how to update the file
```
