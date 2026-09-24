# ADR-002: Offline-First Storage

Status: Proposed

## Context

Live operations must continue without internet or a remote server. The first release is a single trusted workstation. Data must remain portable, searchable, backed up, and suitable for later synchronization.

## Decision

Use a local SQLite database in WAL mode for structured application data. Store attachments and generated artifacts beneath an application-managed data directory and reference them from the database with relative paths and content hashes.

## Requirements

- **STORAGE-001:** Core reads and writes MUST require no network service.
- **STORAGE-002:** Multi-record workflows MUST use transactions.
- **STORAGE-003:** Foreign-key enforcement MUST be enabled.
- **STORAGE-004:** Released schema changes MUST use ordered, checksum-tracked migrations.
- **STORAGE-005:** A verified backup MUST be created before a migration changes an existing database.
- **STORAGE-006:** Backups MUST use SQLite's supported online-backup mechanism rather than copying an open database file.
- **STORAGE-007:** Restore MUST validate integrity and schema compatibility before replacing active data.
- **STORAGE-008:** Connector credentials MUST NOT be stored as plaintext in SQLite, logs, backups, or exported events.
- **STORAGE-009:** Records MUST use globally unique identifiers suitable for a possible future synchronization design.
- **STORAGE-010:** Cached external records MUST retain source, retrieval time, expiry/freshness metadata, and raw source data where permitted.

## Consequences

- The product remains independently usable during internet outages.
- Online connectors write through controlled application services rather than directly into UI state.
- Future multi-workstation synchronization will require a separate protocol and conflict model; UUIDs and revisions reduce but do not eliminate that future work.

