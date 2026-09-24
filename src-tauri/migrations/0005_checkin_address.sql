PRAGMA foreign_keys = ON;

-- Full mailing address from a callbook connector (e.g. QRZ), distinct from
-- the shorter qth_location summary and from any reported-location text.
ALTER TABLE checkins ADD COLUMN address TEXT;
