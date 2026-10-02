-- Range checks: what kind of station checked in (mobile, base, HT) and the
-- cross street it gave for where it is. The exact point is the check-in's
-- existing location; the two signal reports use rst_sent (how net control
-- hears the station) and rst_received (how the station hears the repeater).
ALTER TABLE checkins ADD COLUMN station_kind TEXT;
ALTER TABLE checkins ADD COLUMN cross_street TEXT;
