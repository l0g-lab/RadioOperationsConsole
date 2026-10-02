# Security

## Reporting a problem

If you find a security problem — for example a way for something on a map,
in an APRS feed, or in a downloaded file to run code, or to read or write
files the operator didn't choose — please don't open a public issue. Report
it privately through GitHub's
[security advisories](https://github.com/l0g-lab/RadioOperationsConsole/security/advisories/new),
with what you found, how to reproduce it, and the version and platform.

You'll get an answer as soon as practical. This is a volunteer project, so
please allow some time for a fix before anything is made public.

## Supported versions

Fixes go into the newest release. Please update before reporting.

## How the app limits what it can do

- The app's window may only write files where the operator chose to save
  them in a save dialog, and loads content only from the app itself,
  OpenStreetMap tiles, and NWS radar images.
- Network access happens in the app's backend, only to the services it
  names (QRZ, NWS, APRS-IS, the FCC, and the Florida DOT for mile markers),
  and not at all while working offline.
- APRS is receive-only. Nothing is ever transmitted.
- Updates come only from this project's published GitHub releases, over
  HTTPS, and the installer is opened only after you click Update now. Updates
  aren't cryptographically signed yet, so they carry the same trust as
  downloading an installer from the Releases page yourself.
