-- Traffic is noted on the check-in it came from: whether the station has any,
-- what it is, and whether it has been dealt with.
ALTER TABLE checkins ADD COLUMN has_traffic INTEGER NOT NULL DEFAULT 0;
ALTER TABLE checkins ADD COLUMN traffic TEXT;
ALTER TABLE checkins ADD COLUMN traffic_handled INTEGER NOT NULL DEFAULT 0;
