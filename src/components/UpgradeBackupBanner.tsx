import { useEffect, useState } from "react";
import * as api from "../api";
import type { UpgradeBackup } from "../types";

/**
 * After this version upgraded an existing database, says once where the copy
 * from before the upgrade was saved (or that saving it failed). Dismissed for
 * this launch only; the next upgrade shows its own.
 */
export default function UpgradeBackupBanner() {
  const [saved, setSaved] = useState<UpgradeBackup | null>(null);

  useEffect(() => {
    api
      .upgradeBackup()
      .then(setSaved)
      .catch(() => setSaved(null));
  }, []);

  if (!saved) return null;
  return (
    <div className={"upgrade-banner" + (saved.path ? "" : " upgrade-banner-error")} role="status">
      {saved.path ? (
        <span>
          Your data was updated for this version. A copy from before the update was saved to{" "}
          <code className="upgrade-banner-path">{saved.path}</code> — restore it from Settings →
          Backup if anything looks wrong.
        </span>
      ) : (
        <span>
          Your data was updated for this version, but a copy from before the update couldn't be
          saved ({saved.error}). Consider making a backup now from Settings → Backup.
        </span>
      )}
      <button className="link-button" onClick={() => setSaved(null)}>
        Dismiss
      </button>
    </div>
  );
}
