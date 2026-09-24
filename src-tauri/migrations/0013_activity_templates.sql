CREATE TABLE IF NOT EXISTS activity_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    title TEXT NOT NULL,
    scheduled_time TEXT,
    frequency TEXT,
    location_label TEXT,
    location_lat REAL,
    location_lon REAL,
    created_at TEXT NOT NULL
);
