-- Archiving is gone: finished nets stay listed (under Closed, folded) so none
-- go missing, and Delete removes one for good. Anything archived comes back.
-- The column stays for older backups; the archive events stay in History.
UPDATE activities SET archived_at = NULL WHERE archived_at IS NOT NULL;
