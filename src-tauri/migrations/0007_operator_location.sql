PRAGMA foreign_keys = ON;

-- Directory/QTH location for an operator profile, resolved the same
-- free-text-to-coordinates way as the weather area of interest
-- (see set_weather_area / set_operator_location).
ALTER TABLE operators ADD COLUMN location_query TEXT;
ALTER TABLE operators ADD COLUMN location_label TEXT;
ALTER TABLE operators ADD COLUMN location_lat REAL;
ALTER TABLE operators ADD COLUMN location_lon REAL;
