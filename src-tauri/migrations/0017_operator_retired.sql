-- Retired operators (AUDIT-013): hidden from operator lists and pickers but
-- kept, so history still shows who recorded what.
ALTER TABLE operators ADD COLUMN retired_at TEXT;
