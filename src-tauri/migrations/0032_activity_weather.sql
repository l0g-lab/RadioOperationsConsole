-- The weather when a net started and when it ended (docs/features/net-weather.md):
-- the nearest NWS station's reading at the repeater, or else net control's
-- location, and the NWS alerts then in effect there. Read automatically; one
-- row per moment, replaced if the net is ended again after reopening.
CREATE TABLE activity_weather (
    activity_id TEXT NOT NULL REFERENCES activities(id),
    -- 'start' or 'end'.
    moment TEXT NOT NULL CHECK (moment IN ('start', 'end')),
    -- Which location it was read for: 'repeater' or 'net_control'.
    place TEXT NOT NULL,
    -- The station reporting, e.g. "KORL" and its name.
    station_id TEXT NOT NULL,
    station_name TEXT NOT NULL DEFAULT '',
    -- When the station took the reading (UTC, RFC 3339).
    observed_at TEXT NOT NULL,
    temp_c REAL,
    conditions TEXT NOT NULL DEFAULT '',
    wind_dir_deg REAL,
    wind_speed_kmh REAL,
    wind_gust_kmh REAL,
    -- The alerts in effect, e.g. "Severe Thunderstorm Warning", one per line.
    alerts TEXT NOT NULL DEFAULT '',
    recorded_at TEXT NOT NULL,
    PRIMARY KEY (activity_id, moment)
);
