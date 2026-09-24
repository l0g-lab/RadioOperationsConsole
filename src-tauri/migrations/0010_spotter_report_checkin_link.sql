PRAGMA foreign_keys = ON;
ALTER TABLE spotter_reports ADD COLUMN checkin_id TEXT REFERENCES checkins(id);
