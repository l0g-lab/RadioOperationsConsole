-- Whether a check-in's map location was placed by hand (picked on the map,
-- typed as coordinates or a mile marker, or a range check's pin) rather than
-- worked out from its address, ZIP, grid square, or QRZ. Lookup and edits may
-- replace an automatic location with a better one, never a hand-placed one.
-- Earlier check-ins can't be told apart, so they count as automatic, except
-- range checks, whose points are always pinned by hand.
ALTER TABLE checkins ADD COLUMN location_manual INTEGER NOT NULL DEFAULT 0;
UPDATE checkins SET location_manual = 1
 WHERE location_lat IS NOT NULL
   AND activity_id IN (SELECT id FROM activities WHERE type = 'range_check');
