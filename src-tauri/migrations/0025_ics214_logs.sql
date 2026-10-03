-- ICS 214 activity logs (docs/features/ics-form-exports.md): a period of
-- operation with its header fields and log lines, kept so lines added or
-- changed by hand survive closing the window and exporting again.
CREATE TABLE ics214_logs (
    id TEXT PRIMARY KEY,
    incident_name TEXT NOT NULL,
    -- RFC 3339 instants.
    period_from TEXT NOT NULL,
    period_to TEXT NOT NULL,
    name TEXT,
    ics_position TEXT,
    home_agency TEXT,
    prepared_name TEXT,
    -- JSON: [{ "name", "position", "agency" }]
    resources TEXT NOT NULL DEFAULT '[]',
    -- JSON: activity ids left out of the log.
    excluded_activities TEXT NOT NULL DEFAULT '[]',
    -- JSON: [{ "at", "text", "source" }]; source names the record a line came from.
    lines TEXT NOT NULL DEFAULT '[]',
    -- JSON: sources of generated lines the operator deleted.
    dismissed TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
