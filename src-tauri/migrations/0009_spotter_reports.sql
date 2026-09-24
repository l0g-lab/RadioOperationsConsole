PRAGMA foreign_keys = ON;
CREATE TABLE spotter_reports (
    id TEXT PRIMARY KEY,
    activity_id TEXT NOT NULL REFERENCES activities(id),
    operator_id TEXT REFERENCES operators(id),
    reported_at TEXT NOT NULL,
    county TEXT,
    location_text TEXT,
    lat REAL,
    lon REAL,
    reporter TEXT,
    hazard_type TEXT NOT NULL,
    magnitude TEXT,
    source TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    voided_at TEXT,
    void_reason TEXT
);
