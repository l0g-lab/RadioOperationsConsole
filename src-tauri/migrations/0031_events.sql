-- Events become their own record (docs/features/events.md): created on the
-- Events tab, holding activities and the event's ICS 214 log. Event names
-- already typed on activities become events, and those activities join them.
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    -- YYYY-MM-DD, optional: lets an event with no activities yet sort by date.
    date TEXT,
    created_at TEXT NOT NULL
);
ALTER TABLE activities ADD COLUMN event_id TEXT REFERENCES events(id);
ALTER TABLE ics214_logs ADD COLUMN event_id TEXT REFERENCES events(id);

INSERT INTO events(id, name, created_at)
SELECT lower(hex(randomblob(16))), event, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM activities WHERE event IS NOT NULL AND trim(event) != '' GROUP BY event;
UPDATE activities SET event_id = (SELECT id FROM events WHERE events.name = activities.event)
WHERE event IS NOT NULL AND trim(event) != '';
-- An activity log named after an event becomes that event's log.
UPDATE ics214_logs SET event_id = (SELECT id FROM events WHERE events.name = ics214_logs.incident_name);
