-- Events (docs/features/events.md): an optional label grouping activities
-- that belong together, such as the nets and relays of one exercise.
ALTER TABLE activities ADD COLUMN event TEXT;
