-- Activity templates are removed: picking a repeater now fills in what they
-- mostly saved, and net listings will describe recurring nets. Anything that
-- was in this table is kept in the copy saved before this upgrade.
DROP TABLE IF EXISTS activity_templates;
