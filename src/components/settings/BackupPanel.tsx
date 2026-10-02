import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import * as api from "../../api";
import type { BackupSummary } from "../../types";
import { pad2 } from "../../utils";
import InfoToggle from "./InfoToggle";
import { DatabaseBackup } from "lucide-react";

const LAST_BACKUP_KEY = "roc-last-backup";
const FILTERS = [{ name: "Radio Operations Console backup", extensions: ["db"] }];

type Message = { kind: "ok" | "error"; text: string };

function defaultFileName(): string {
  const d = new Date();
  return `radio-ops-backup-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(
    d.getHours()
  )}${pad2(d.getMinutes())}.db`;
}

function readLastBackup(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : d.toLocaleString();
}

function describe(s: BackupSummary): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  return [
    n(s.operators, "operator", "operators"),
    n(s.activities, "activity", "activities"),
    n(s.checkins, "check-in", "check-ins"),
    n(s.spotter_reports, "spotter report", "spotter reports"),
  ].join(", ");
}

/**
 * Backs up everything in the app (operators, activities, repeaters, check-ins,
 * reports, the audit log) to one file, and restores it from one. Downloaded
 * offline data and the QRZ login are not part of it.
 */
export default function BackupPanel() {
  const [lastBackup, setLastBackup] = useState<string | null>(readLastBackup);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  // A backup file chosen for restoring, waiting for confirmation.
  const [pending, setPending] = useState<{ path: string; summary: BackupSummary } | null>(null);

  async function backUp() {
    setMessage(null);
    setPending(null);
    try {
      const path = await save({ defaultPath: defaultFileName(), filters: FILTERS });
      if (!path) return;
      setBusy(true);
      const summary = await api.backupDatabase(path);
      const now = new Date().toISOString();
      try {
        localStorage.setItem(LAST_BACKUP_KEY, now);
      } catch {
        // Only the "last backed up" reminder is lost.
      }
      setLastBackup(now);
      setMessage({ kind: "ok", text: `Backed up ${describe(summary)} to ${path}` });
    } catch (e) {
      setMessage({ kind: "error", text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function chooseRestore() {
    setMessage(null);
    setPending(null);
    try {
      const chosen = await open({ multiple: false, directory: false, filters: FILTERS });
      if (!chosen || Array.isArray(chosen)) return;
      setBusy(true);
      const summary = await api.inspectBackup(chosen);
      setPending({ path: chosen, summary });
    } catch (e) {
      setMessage({ kind: "error", text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function confirmRestore() {
    if (!pending) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.restoreDatabase(pending.path);
      setPending(null);
      setMessage({
        kind: "ok",
        text: `Restored ${describe(result.summary)}. The data it replaced was saved to ${result.safety_copy}. Reloading…`,
      });
      // Everything on screen came from the old data, so start fresh.
      setTimeout(() => window.location.reload(), 2500);
    } catch (e) {
      setMessage({ kind: "error", text: String(e) });
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h3>
        <DatabaseBackup className="heading-icon" />
        Backup &amp; Restore
        <InfoToggle label="backup and restore">
          A backup is one file holding everything you've entered: operators, activities,
          repeaters, check-ins, spotter reports, traffic and the history log. Keep copies somewhere safe, such
          as a USB stick or cloud folder. Restoring replaces everything currently in the app with
          the backup's contents, after saving a copy of what's there now so a restore can be undone
          (the last few of these are kept next to the database). It doesn't include the downloaded
          offline data (road files, FCC call signs), your settings, or your QRZ login.
        </InfoToggle>
      </h3>
      <div className="offline-pack-row">
        <div className="offline-pack-info">
          <strong>Database</strong>{" "}
          <span className="updated-badge">
            Last backed up: <strong>{lastBackup ? formatWhen(lastBackup) : "never"}</strong>
          </span>
        </div>
        <div className="inline-form">
          <button onClick={backUp} disabled={busy}>
            Back up now…
          </button>
          <button onClick={chooseRestore} disabled={busy}>
            Restore from backup…
          </button>
        </div>
      </div>
      {pending && (
        <div className="inline-form confirm-row">
          <span>
            Restore this backup ({describe(pending.summary)}
            {pending.summary.modified ? `, saved ${formatWhen(pending.summary.modified)}` : ""})?
            Everything currently in the app will be replaced. A copy of it is saved first.
          </span>
          <button onClick={confirmRestore} disabled={busy}>
            Restore
          </button>
          <button onClick={() => setPending(null)} disabled={busy}>
            Cancel
          </button>
        </div>
      )}
      {message?.kind === "ok" && <p className="qrz-status qrz-status-found">{message.text}</p>}
      {message?.kind === "error" && <p className="weather-area-error">{message.text}</p>}
    </div>
  );
}
