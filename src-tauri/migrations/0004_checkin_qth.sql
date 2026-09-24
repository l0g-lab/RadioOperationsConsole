PRAGMA foreign_keys = ON;

-- Directory/QTH data (e.g. from QRZ), kept distinct from any future
-- reported-location-text field per DOMAIN-001/002.
ALTER TABLE checkins ADD COLUMN qth_location TEXT;
ALTER TABLE checkins ADD COLUMN grid_square TEXT;
