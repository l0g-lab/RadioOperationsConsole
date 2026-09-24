PRAGMA foreign_keys = ON;

-- Add scheduled_at to activities so nets can be grouped by date
ALTER TABLE activities ADD COLUMN scheduled_at TEXT;

CREATE INDEX IF NOT EXISTS idx_activities_scheduled_at ON activities(scheduled_at);
