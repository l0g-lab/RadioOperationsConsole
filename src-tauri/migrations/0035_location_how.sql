-- How each check-in's and spotter report's map point was arrived at
-- (location-resolution.md, LOCRES-064): 'pin', 'coords', 'grid',
-- 'mile_marker', 'saved_place', 'qrz', 'address', 'crossing', 'street',
-- 'town', 'region', 'zip', 'station_grid', or '' when not known (records from
-- before this was kept, or not on the map). 'grid', 'zip', 'station_grid',
-- 'street', 'town' and 'region' are approximate.
ALTER TABLE checkins ADD COLUMN location_how TEXT NOT NULL DEFAULT '';
ALTER TABLE spotter_reports ADD COLUMN location_how TEXT NOT NULL DEFAULT '';
