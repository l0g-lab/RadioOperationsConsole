-- Lifecycle timestamps (UTC, RFC 3339) and the operator's closing notes.
-- `state` already exists: existing activities keep "active"; new ones start
-- as "scheduled" and move to "active" and "closed" through the lifecycle
-- commands, each of which also writes an audit event.
ALTER TABLE activities ADD COLUMN opened_at TEXT;
ALTER TABLE activities ADD COLUMN closed_at TEXT;
ALTER TABLE activities ADD COLUMN conclusion TEXT;
