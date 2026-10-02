-- Net listings (docs/features/net-listings.md): the nets in the area, which
-- repeater, and when. Reference data only; nothing is stored per meeting.
CREATE TABLE net_listings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    activity_type TEXT NOT NULL DEFAULT 'directed_net',
    -- A repeater from the directory, or else free-text frequency.
    repeater_id TEXT REFERENCES repeaters(id),
    frequency TEXT,
    -- 'weekly', 'monthly' or 'as_needed'.
    schedule_kind TEXT NOT NULL,
    -- Weekdays, 0 = Sunday, comma-separated: '2' or '1,2,3,4,5'.
    weekdays TEXT,
    -- Monthly only: weeks of the month, comma-separated: '2,4' or 'last'.
    weeks TEXT,
    -- Local time, 'HH:MM'.
    start_time TEXT,
    end_time TEXT,
    run_by TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    retired_at TEXT
);
