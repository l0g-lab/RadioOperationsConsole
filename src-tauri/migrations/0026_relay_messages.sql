-- Relay station (docs/features/relay-station.md): traffic received from one
-- station to pass on to another, and what happened when passing it on.
CREATE TABLE relay_messages (
    id TEXT PRIMARY KEY,
    activity_id TEXT NOT NULL REFERENCES activities(id),
    operator_id TEXT REFERENCES operators(id),
    received_at TEXT NOT NULL,
    from_station TEXT NOT NULL,
    for_station TEXT NOT NULL,
    message TEXT NOT NULL,
    -- The frequency, repeater, or other means it came in on.
    received_via TEXT,
    -- The message this answers, when it's a reply coming back.
    reply_to TEXT REFERENCES relay_messages(id),
    created_at TEXT NOT NULL,
    voided_at TEXT,
    void_reason TEXT
);
CREATE INDEX relay_messages_activity ON relay_messages(activity_id);

-- Each step in passing a message on: a failed attempt, passing it, or giving
-- up. A message with no "passed" or "not_passed" step is still held.
CREATE TABLE relay_steps (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES relay_messages(id),
    operator_id TEXT REFERENCES operators(id),
    kind TEXT NOT NULL CHECK (kind IN ('attempt', 'passed', 'not_passed')),
    at TEXT NOT NULL,
    -- Who it was passed (or tried) to.
    station TEXT,
    -- The frequency, repeater, or other means used.
    via TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    voided_at TEXT
);
CREATE INDEX relay_steps_message ON relay_steps(message_id);
