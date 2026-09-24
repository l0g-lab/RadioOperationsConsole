PRAGMA foreign_keys = ON;
ALTER TABLE activities ADD COLUMN location_query TEXT;
ALTER TABLE activities ADD COLUMN location_label TEXT;
ALTER TABLE activities ADD COLUMN location_lat REAL;
ALTER TABLE activities ADD COLUMN location_lon REAL;
