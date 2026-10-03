-- Saved places (docs/features/saved-places.md): spots net control often
-- operates from — home, a friend's QTH, the club headquarters — to pick in
-- the map instead of finding them again each time.
CREATE TABLE places (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
);
