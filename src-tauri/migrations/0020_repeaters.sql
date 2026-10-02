-- The repeater directory (docs/features/repeater-directory.md): each repeater
-- once, with its offset and tones. Retired ones are hidden, not deleted.
CREATE TABLE repeaters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    output_mhz REAL NOT NULL,
    -- Signed: input = output + offset. 0 is simplex.
    offset_mhz REAL NOT NULL DEFAULT 0,
    -- 'none', 'pl' or 'dcs'; the value is e.g. '100.0' or '023N'.
    tone_in_kind TEXT NOT NULL DEFAULT 'none',
    tone_in TEXT,
    tone_out_kind TEXT NOT NULL DEFAULT 'none',
    tone_out TEXT,
    mode TEXT NOT NULL DEFAULT 'FM',
    location_label TEXT,
    location_lat REAL,
    location_lon REAL,
    notes TEXT,
    created_at TEXT NOT NULL,
    retired_at TEXT
);

-- An activity's repeater, copied from the directory or set by hand: kept
-- apart from the activity's own location, which is where net control is.
ALTER TABLE activities ADD COLUMN repeater_name TEXT;
ALTER TABLE activities ADD COLUMN repeater_lat REAL;
ALTER TABLE activities ADD COLUMN repeater_lon REAL;

-- Range checks kept the repeater in the activity's location until now.
UPDATE activities
SET repeater_name = location_label,
    repeater_lat = location_lat,
    repeater_lon = location_lon,
    location_label = NULL,
    location_lat = NULL,
    location_lon = NULL
WHERE type = 'range_check' AND location_lat IS NOT NULL;
