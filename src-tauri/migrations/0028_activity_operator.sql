-- The operator running each activity (net control): the call sign its records,
-- history, and forms go under. Replaces choosing an operator in the top bar.
-- Existing activities get the operator who recorded most of their records.
ALTER TABLE activities ADD COLUMN operator_id TEXT REFERENCES operators(id);
UPDATE activities SET operator_id = (
    SELECT op FROM (
        SELECT operator_id AS op FROM checkins WHERE activity_id = activities.id
        UNION ALL SELECT operator_id FROM spotter_reports WHERE activity_id = activities.id
        UNION ALL SELECT operator_id FROM relay_messages WHERE activity_id = activities.id
        UNION ALL SELECT operator_id FROM audit_events WHERE entity_id = activities.id
    )
    WHERE op IS NOT NULL AND op IN (SELECT id FROM operators)
    GROUP BY op ORDER BY COUNT(*) DESC LIMIT 1
);
