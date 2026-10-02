# Scope and Release Boundaries

## Initial usable release

The initial usable release covers one trusted workstation and local data store.

### Required foundation

- Operator profiles and current-operator selection
- Organization and station settings
- Activity types and a repeater directory
- Multiple open activities with one focused activity
- Event lifecycle and a chronological record of the activity (the History tab)
- Local and UTC time display
- Revision and audit history
- Local backup and verified restore
- Search and structured export foundation

### Weekly-net capability

- Simple and directed-net activity types
- Opening and closing scripts
- Rapid check-ins
- Optional name and location
- Traffic-none or traffic-listed state
- Announcements and general notes (recorded in the net's closing notes; there is no separate log)
- Net conclusion and summary

### Emergency and exercise capability

- Incidents and structured reports
- Tactical and formal traffic records
- Assignments and status
- Exercise objectives and injects
- Explicit simulated/real-world marking
- Operational-period support

### SKYWARN capability

- Check-ins linked to reports
- Fixed, versioned baseline report categories and magnitude profiles
- NWS alert retrieval and caching
- Weather radar display
- Map-assisted observation location
- Spotter-report and incident summaries

### Online enhancement capability

- Receive-only APRS-IS ingestion
- Local-radio/TNC APRS ingestion
- QRZ callbook name enrichment when configured by an eligible subscriber
- Online geocoding and reverse geocoding
- Online map and radar sources

### Output capability

- Printable HTML or native print preview
- PDF
- CSV for tabular records
- Full-fidelity JSON event package
- Architecture for official ICS-form renderers
- Architecture for versioned Winlink Standard Forms load-data text adapters

## Explicit non-goals

- **SCOPE-NG-001:** General QSO logging, awards, DXCC tracking, contest scoring, LoTW, or eQSL synchronization
- **SCOPE-NG-002:** Slack or other team-chat integration
- **SCOPE-NG-003:** APRS transmission, messaging, digipeating, or IGate operation in the initial release
- **SCOPE-NG-004:** Automatic transmission through Winlink
- **SCOPE-NG-005:** Automatic submission of reports to NWS or served agencies
- **SCOPE-NG-006:** Multi-workstation concurrent editing in the initial release
- **SCOPE-NG-007:** Replacing SKYWARN training, operator judgment, or local operating procedures
- **SCOPE-NG-008:** Treating external or cached information as verified operational fact without operator action

## Deferred without architectural exclusion

- LAN multi-operator mode
- Direct Winlink integration
- Additional local-radio device profiles
- Mobile companion application
- Optional plugin API
- Additional official and agency-specific forms
- Offline radar archives beyond bounded recent-frame caching

## Release-boundary requirements

- **SCOPE-001:** Every initial-release feature MUST support the single-workstation operating model.
- **SCOPE-002:** Data identifiers and command contracts SHOULD avoid assumptions that would prevent later LAN synchronization.
- **SCOPE-003:** Each online feature MUST specify offline, stale, authentication-error, and retry behavior.
- **SCOPE-004:** A feature is not complete until its empty, error, correction, and export states are tested.
- **SCOPE-005:** A report adapter MUST identify its exact target form and compatibility version.
- **SCOPE-006:** Winlink load-data output MUST be labeled as import data, not as a sent or queued message.
