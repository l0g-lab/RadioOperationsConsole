PRAGMA foreign_keys = ON;

-- checkins.location_text was written-once-as-NULL and never read by any
-- query in this application (create_checkin always received null for it
-- from the UI) — dead schema from before qth_location/grid_square/address
-- were split out as the actual reported-location fields.
ALTER TABLE checkins DROP COLUMN location_text;

-- operators.location_query and activities.location_query were meant to
-- hold the free-text search that produced a geocoded location, but every
-- location-setting path in the UI goes through the coordinates-only
-- LocationPicker flow (set_*_location_coords), which never populates it —
-- in practice these columns have only ever held NULL. Dropped rather than
-- kept around unpopulated.
ALTER TABLE operators DROP COLUMN location_query;
ALTER TABLE activities DROP COLUMN location_query;
