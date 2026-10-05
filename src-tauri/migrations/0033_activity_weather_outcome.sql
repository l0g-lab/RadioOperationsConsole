-- Why a net has no weather for a moment, so the summary can say
-- (net-weather.md, WX-006): 'ok' (a reading), 'offline' (working offline),
-- 'no_place' (no repeater or net control location), 'error' (NWS couldn't be
-- reached or refused), or 'no_reading' (no nearby station reported).
ALTER TABLE activity_weather ADD COLUMN outcome TEXT NOT NULL DEFAULT 'ok';
