-- Activity types replace the single hard-coded "weekly_net". Every activity
-- so far has been run as a directed net, so that is what they become; the
-- type can be changed on any activity. Templates remember a type too.
UPDATE activities SET type = 'directed_net' WHERE type = 'weekly_net';
ALTER TABLE activity_templates ADD COLUMN activity_type TEXT NOT NULL DEFAULT 'directed_net';
