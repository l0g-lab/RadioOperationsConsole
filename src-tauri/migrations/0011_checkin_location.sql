PRAGMA foreign_keys = ON;

-- Resolved coordinates for a check-in, stored once at save time (offline
-- first: ZIP centroid, then grid square; online geocoding as an explicit
-- fallback — see src/locationResolution.ts) rather than re-derived from
-- qth_location/grid_square/address on every map render. location_label
-- mirrors the operators/activities location shape for consistency.
ALTER TABLE checkins ADD COLUMN location_lat REAL;
ALTER TABLE checkins ADD COLUMN location_lon REAL;
ALTER TABLE checkins ADD COLUMN location_label TEXT;
