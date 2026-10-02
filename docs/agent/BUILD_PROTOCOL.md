# Vendor-Neutral Build Protocol

## Purpose

This protocol defines how a human developer or automated implementation agent uses the specification. It does not assume a particular model, vendor, IDE, or hosting service.

## Required preparation

Before changing code:

1. Read `docs/README.md` and `spec-manifest.yaml`.
2. Read all documents listed before the target document in `reading_order` when they govern the task.
3. Read every feature, contract, and architecture decision directly touched by the task.
4. Identify the stable requirement IDs being implemented.
5. Record unresolved questions and do not invent consequential product behavior.

## Unit of work

Work on one bounded vertical slice at a time. A typical slice includes:

1. Failing acceptance or contract test
2. Domain behavior
3. Persistence or connector adapter when required
4. Application command/API boundary
5. User interface behavior
6. Error, empty, loading, and offline states
7. Documentation and traceability update

Do not implement an entire feature area in one undifferentiated change.

## Test-driven cycle

1. Select one or more requirement IDs.
2. Translate them into executable tests or explicit acceptance fixtures.
3. Confirm that the new test fails for the expected reason.
4. Implement the smallest coherent behavior that satisfies the requirement.
5. Refactor without weakening coverage.
6. Run affected tests and the required project checks.
7. Report exact results and remaining limitations.

## Traceability

Every acceptance-level test MUST cite at least one requirement ID. Every normative requirement MUST eventually map to one of:

- Automated unit test
- Automated integration test
- Automated end-to-end test
- Golden-file or visual-regression test
- Explicit manual release check with justification

The repository SHOULD maintain a generated or reviewable requirement-to-test matrix.

## Engineering constraints

- Business rules MUST NOT exist only in UI components.
- Time, ID generation, network responses, and filesystem locations MUST be injectable or controllable in tests.
- Tests MUST NOT depend on live NWS, QRZ, APRS, map, radar, or geocoding services.
- Connector tests MUST use recorded, permitted fixtures with secrets removed.
- Logs and fixtures MUST contain no real credentials or unnecessary personal data.
- External writes MUST NOT be added unless expressly specified.
- Slack and other team-chat functionality MUST NOT be introduced.
- An internet connection MUST NOT be required to run the core automated test suite.

## Definition of done

A task is complete only when:

- All cited requirements are satisfied.
- New tests passed after first failing for the intended reason.
- Existing required tests pass.
- Formatting, lint, type checking, and platform-appropriate static checks pass.
- Error, empty, offline, stale, and recovery states are addressed where relevant.
- Accessibility labels and keyboard behavior are verified for changed UI.
- Schema migrations include upgrade and rollback-by-restore tests when applicable.
- No secrets or sensitive values appear in logs, fixtures, or diagnostics.
- Deviations from the specification are documented rather than silently accepted.

## Stop conditions

Stop and request a decision when:

- Two normative requirements conflict.
- A required external interface cannot legally or technically support the behavior.
- A form or Winlink adapter version cannot be verified.
- A security or privacy decision would materially expand stored data.
- A proposed dependency changes platform, licensing, or offline requirements.
- Passing a test would require weakening or bypassing a normative requirement.

## Implementation report

At the end of each slice, report:

- Requirement IDs addressed
- Files changed
- Tests added or changed
- Commands/checks executed and exact outcomes
- Known limitations
- Assumptions or deviations
- Recommended next bounded slice

