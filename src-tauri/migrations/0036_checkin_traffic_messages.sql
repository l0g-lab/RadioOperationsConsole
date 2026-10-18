-- Traffic is kept one way (relay-station.md, RELAY-050): traffic noted on a
-- check-in becomes a message linked to it, so it can be passed on, tried and
-- failed, or given up on like a relay's. The check-in's own traffic columns
-- go; `traffic` stays for net control's notes (NETOPS-060), which aren't traffic.
ALTER TABLE relay_messages ADD COLUMN checkin_id TEXT REFERENCES checkins(id);
-- A check-in has at most one live traffic message.
CREATE UNIQUE INDEX relay_messages_checkin ON relay_messages(checkin_id) WHERE voided_at IS NULL;

-- Received from the station that checked in, when it checked in, on the net's
-- frequency. Removed check-ins keep theirs, to come back if restored.
INSERT INTO relay_messages(id, activity_id, operator_id, received_at, from_station, for_station, message, received_via, created_at, checkin_id)
SELECT lower(hex(randomblob(16))), c.activity_id, c.operator_id, c.checked_in_at, c.call_sign, '', coalesce(c.traffic, ''),
       nullif(trim(coalesce(a.frequency, '')), ''), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), c.id
FROM checkins c JOIN activities a ON a.id = c.activity_id
WHERE c.has_traffic = 1 AND coalesce(c.station_kind, '') <> 'net_control';

-- Traffic marked handled was passed on, when it was last marked and by whom.
INSERT INTO relay_steps(id, message_id, operator_id, at, kind, created_at)
SELECT lower(hex(randomblob(16))), m.id,
       (SELECT e.operator_id FROM audit_events e WHERE e.entity_type = 'checkin' AND e.entity_id = c.id
            AND e.action = 'traffic_handled' ORDER BY e.created_at DESC, e.rowid DESC LIMIT 1),
       coalesce((SELECT e.created_at FROM audit_events e WHERE e.entity_type = 'checkin' AND e.entity_id = c.id
            AND e.action = 'traffic_handled' ORDER BY e.created_at DESC, e.rowid DESC LIMIT 1), c.checked_in_at),
       'passed', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM relay_messages m JOIN checkins c ON c.id = m.checkin_id
WHERE c.traffic_handled = 1;

UPDATE checkins SET traffic = NULL WHERE coalesce(station_kind, '') <> 'net_control';
ALTER TABLE checkins DROP COLUMN has_traffic;
ALTER TABLE checkins DROP COLUMN traffic_handled;
