PRAGMA foreign_keys = ON;

-- Corrections update rows in place; removal/archival is soft (AUDIT-003) via
-- these nullable markers rather than physical deletes.
ALTER TABLE checkins ADD COLUMN voided_at TEXT;
ALTER TABLE checkins ADD COLUMN void_reason TEXT;

ALTER TABLE activities ADD COLUMN archived_at TEXT;

CREATE INDEX IF NOT EXISTS idx_checkins_voided ON checkins(activity_id, voided_at);
CREATE INDEX IF NOT EXISTS idx_activities_archived ON activities(archived_at);
