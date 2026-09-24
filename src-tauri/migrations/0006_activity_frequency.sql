PRAGMA foreign_keys = ON;

-- Channel/frequency an activity is conducted on (NETOPS-040). Free text: a
-- repeater description with offset/tone, or a simplex frequency.
ALTER TABLE activities ADD COLUMN frequency TEXT;
