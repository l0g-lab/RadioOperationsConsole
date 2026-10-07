# Specification

The app is built from a vendor-neutral product and engineering
specification, kept in this folder. It's for contributors: what the app
should do and why, one document per area. If you just want to use the app,
see the [main README](../README.md).

The specification is a guide, not a contract: it records decisions so they
stay consistent, and it changes along with the app.

## Layout

- `00`–`07` — the core product and engineering specification, read in order.
- `decisions/` — architecture decision records (ADRs).
- `features/` — one file per feature, with the procedure and interaction
  detail specific to it.
- `agent/` — the build protocol, for human or automated implementers.
- [`../spec-manifest.yaml`](../spec-manifest.yaml) — the machine-readable
  index: document ids, dependencies, status, and the registry of requirement-id
  prefixes. If this reading order ever drifts from it, the manifest wins.

## Governing decisions

- The application works offline for all core logging and incident-management functions.
- Internet connectors enhance the application but never gate core work.
- The first release is a trusted, single-workstation application.
- Several activities may remain open, but only one is focused in the interface at a time.
- The interface uses persistent tabs and activity-specific feature visibility.
- Each activity is run by an operator, a name/call-sign profile without a password.
- Every operational record and correction is attributed and timestamped.
- APRS is receive-only situational awareness in the initial scope.
- SKYWARN report categories and magnitude profiles are built-in, fixed, and versioned.
- No Slack or other team-chat integration is in scope.
- Specifications and build instructions are independent of any particular AI or coding agent.

## Reading order

1. [00-product-vision.md](00-product-vision.md)
2. [01-product-principles.md](01-product-principles.md)
3. [02-scope-and-release-boundaries.md](02-scope-and-release-boundaries.md)
4. [03-personas-and-operating-context.md](03-personas-and-operating-context.md)
5. [04-domain-language.md](04-domain-language.md)
6. [05-event-and-template-model.md](05-event-and-template-model.md)
7. [06-application-shell-and-navigation.md](06-application-shell-and-navigation.md)
8. [07-time-audit-and-record-history.md](07-time-audit-and-record-history.md)
9. [decisions/ADR-001-desktop-platform.md](decisions/ADR-001-desktop-platform.md)
10. [decisions/ADR-002-offline-first-storage.md](decisions/ADR-002-offline-first-storage.md)
11. [features/weekly-net-operations.md](features/weekly-net-operations.md)
12. [features/qrz-callsign-enrichment.md](features/qrz-callsign-enrichment.md)
13. [features/checkin-location-map.md](features/checkin-location-map.md)
14. [features/nws-alerts.md](features/nws-alerts.md)
15. [features/weather-radar-display.md](features/weather-radar-display.md)
16. [features/skywarn-incidents-and-reports.md](features/skywarn-incidents-and-reports.md)
17. [features/aprs-is-live-feed.md](features/aprs-is-live-feed.md)
18. [features/location-resolution.md](features/location-resolution.md)
19. [features/mile-marker-lookup.md](features/mile-marker-lookup.md)
20. [features/offline-callsign-directory.md](features/offline-callsign-directory.md)
21. [features/database-backup-restore.md](features/database-backup-restore.md)
22. [features/display-preferences.md](features/display-preferences.md)
23. [features/local-storage.md](features/local-storage.md)
24. [features/activity-lifecycle-and-wrap-up.md](features/activity-lifecycle-and-wrap-up.md)
25. [features/ics-form-exports.md](features/ics-form-exports.md)
26. [features/activity-exports.md](features/activity-exports.md)
27. [features/station-log.md](features/station-log.md)
28. [features/range-check.md](features/range-check.md)
29. [features/repeater-directory.md](features/repeater-directory.md)
30. [features/net-listings.md](features/net-listings.md)
31. [features/saved-places.md](features/saved-places.md)
32. [features/shared-lists.md](features/shared-lists.md)
33. [agent/BUILD_PROTOCOL.md](agent/BUILD_PROTOCOL.md)

## Normative language

The words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY express requirement
strength. Every normative requirement has a stable identifier (`NETOPS-010`,
`RPT-021`), and tests and changes cite those identifiers. A new document picks
an id prefix not already in the manifest's registry.
