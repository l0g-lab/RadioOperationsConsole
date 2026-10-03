# Feature: Display Preferences

## Status

Draft — implemented.

## Purpose

Operators work in bright rooms, dark rooms, and on projectors, and they think
about position in different formats. A few display preferences make the
application comfortable without affecting any record.

## Relationship to other documents

- Set in the Appearance section of Settings
  ([06-application-shell-and-navigation.md](../06-application-shell-and-navigation.md)).
- The coordinate format applies as defined in
  [location-resolution.md](location-resolution.md) (`LOCRES-030`–`034`).

## Requirements

- **PREF-001:** Preferences MUST take effect immediately, without a separate
  save step, and MUST say so where they are set.
- **PREF-002:** Preferences MUST be remembered on the computer they are set
  on, and MUST NOT be stored in the database, the backup file, or anywhere
  they would travel with operational records. If storage is unavailable the
  application MUST still work with defaults.
- **PREF-003:** A stored theme MUST be applied before the first screen is
  drawn, so the application never flashes the wrong theme on launch.

### Theme

- **PREF-010:** The application MUST offer light, dark, and "system"
  themes. "System" MUST follow the operating system's setting, including
  changes made while the application is open, and is the default.
- **PREF-011:** Both themes MUST keep text, fields, and buttons legible;
  fields MUST NOT look disabled.

### Coordinate format

- **PREF-020:** The operator MUST be able to choose decimal degrees,
  degrees and decimal minutes, or degrees/minutes/seconds for how
  coordinates are shown. Decimal degrees is the default.

### Font and text size

- **PREF-040:** The operator MUST be able to choose the interface font: the
  system's (the default), Atkinson Hyperlegible (bundled with the app, so it
  works offline), or a wide font already on the computer (Verdana on Windows,
  DejaVu Sans on Linux). Fonts MUST NOT be downloaded.
- **PREF-041:** The operator MUST be able to choose the text size: small,
  normal (the default), large, or extra large. It scales text only, including
  buttons and fields; zoom (`PREF-030`) scales everything.
- **PREF-042:** Both MUST be applied before the first screen is drawn, as the
  theme is (`PREF-003`).

### Zoom

- **PREF-030:** The interface scale MUST be adjustable from the keyboard
  (Ctrl+Shift with + / − / 0) and remembered.
