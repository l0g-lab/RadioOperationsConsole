-- Radio details of a contact, for station logs (and any check-in that has
-- them): where and how the contact was made, signal reports both ways, and
-- free notes. All optional; the contact's time is the existing checked_in_at.
ALTER TABLE checkins ADD COLUMN frequency TEXT;
ALTER TABLE checkins ADD COLUMN mode TEXT;
ALTER TABLE checkins ADD COLUMN rst_sent TEXT;
ALTER TABLE checkins ADD COLUMN rst_received TEXT;
ALTER TABLE checkins ADD COLUMN power TEXT;
ALTER TABLE checkins ADD COLUMN antenna TEXT;
ALTER TABLE checkins ADD COLUMN notes TEXT;
-- "Worked before" looks a call sign up across every activity.
CREATE INDEX IF NOT EXISTS idx_checkins_call_sign ON checkins(UPPER(call_sign));
