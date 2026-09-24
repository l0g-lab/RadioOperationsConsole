# ADR-001: Desktop Platform

Status: Proposed; architecture spike required

## Context

The product must install and run locally on Windows and Linux, work offline, present information-dense tabbed workflows, display interactive maps and radar layers, access SQLite and files, and later read serial/network APRS sources.

The product owner is comfortable with Python and Rust but has not committed to Tauri.

## Proposed decision

Use Tauri 2 with a Rust application/core layer and a typed HTML/CSS/TypeScript user interface, subject to a time-boxed architecture spike.

The behavioral specifications remain technology-neutral. This ADR may be replaced without rewriting product requirements.

## Why proposed

- Rust is appropriate for local persistence, parsing, network connectors, serial I/O, backup, and report orchestration.
- A web-style UI ecosystem is well suited to tabbed information-dense layouts, accessibility testing, maps, radar overlays, and responsive tables.
- Tauri uses platform webviews rather than bundling a complete Electron runtime.
- Windows and Linux packaging are first-class targets.

## Alternatives

### Python with PySide6/Qt

Advantages: Python familiarity, mature desktop widgets, official Windows/Linux deployment tooling.

Risks: packaging size/complexity, map and radar integration may still depend on web or specialized Qt mapping components, and strict typed domain boundaries require additional discipline.

### Avalonia/.NET

Advantages: cross-platform desktop focus, strong UI tooling, platform integration.

Risks: introduces C#/.NET despite the stated Python/Rust preference; Linux embedded web-content support must be verified for the chosen mapping approach.

### Rust-native UI toolkit

Advantages: one implementation language and no webview UI.

Risks: less mature choices for complex accessible forms, tables, maps, and browser-level UI testing.

## Required spike

The spike MUST prove:

1. Packaged launch on supported Windows and Linux test systems.
2. Persistent tabbed shell with keyboard navigation.
3. SQLite create/read/update transaction.
4. Interactive map with marker selection and coordinate return.
5. Radar or WMS-style overlay proof of concept.
6. Simulated APRS stream ingestion without blocking the UI.
7. Local/UTC clock rendering and deterministic time tests.
8. Installer size, cold-start time, idle memory, and accessibility observations.
9. Automated unit, component, and end-to-end test execution on both platforms.

## Acceptance decision

Adopt Tauri only if the spike has no blocking map/radar, accessibility, packaging, or Linux webview inconsistency. If blocked, compare PySide6/Qt against the same spike rather than changing product requirements.

