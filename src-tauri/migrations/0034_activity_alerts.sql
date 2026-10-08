-- NWS alerts the operator attached to a SKYWARN net (skywarn-incidents-and-reports.md,
-- SPOT-060): a copy of each as it was, since NWS drops an alert from its feed
-- once it expires and the net's record must still say what was in effect.
CREATE TABLE activity_alerts (
    id TEXT PRIMARY KEY,
    activity_id TEXT NOT NULL REFERENCES activities(id),
    -- NWS's own id for the alert, so the same one isn't attached twice.
    nws_id TEXT NOT NULL DEFAULT '',
    -- e.g. "Severe Thunderstorm Warning".
    event TEXT NOT NULL,
    headline TEXT NOT NULL DEFAULT '',
    -- The counties or zones it covers, as NWS words them.
    area_desc TEXT NOT NULL DEFAULT '',
    severity TEXT NOT NULL DEFAULT '',
    -- When it took effect and when the hazard (else the message) ends (UTC, RFC 3339).
    effective TEXT NOT NULL DEFAULT '',
    ends TEXT NOT NULL DEFAULT '',
    attached_at TEXT NOT NULL
);
CREATE INDEX activity_alerts_activity ON activity_alerts(activity_id);
