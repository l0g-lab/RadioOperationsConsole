PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operators (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  call_sign TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  call_sign TEXT NOT NULL,
  name TEXT,
  location_text TEXT,
  checked_in_at TEXT NOT NULL,
  entered_at TEXT NOT NULL,
  operator_id TEXT,
  FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE,
  FOREIGN KEY(operator_id) REFERENCES operators(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_checkins_activity ON checkins(activity_id, checked_in_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  data TEXT,
  operator_id TEXT,
  created_at TEXT NOT NULL
);
