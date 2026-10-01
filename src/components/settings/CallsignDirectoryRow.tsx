import { useEffect, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import * as api from "../../api";
import type { CallsignPackStatus, DatapackProgress, LicenseService } from "../../types";
import { ERR_OFFLINE } from "../../types";
import { offlineMessage } from "../../workOffline";
import InfoToggle from "./InfoToggle";

export interface CallsignDirectoryDef {
  service: LicenseService;
  /** The id the backend puts on this directory's progress events. */
  packId: string;
  title: string;
  infoLabel: string;
  info: ReactNode;
  /** Shown beside the download button, before it's clicked (CALLDIR-031). */
  sizeWarning: string;
}

export const CALLSIGN_DIRECTORIES: CallsignDirectoryDef[] = [
  {
    service: "amateur",
    packId: "callsigns-us",
    title: "Amateur Call Signs (U.S., FCC)",
    infoLabel: "the FCC amateur call-sign file",
    info: (
      <>
        Used only when QRZ isn't available (offline or not set up): fills in a check-in's name,
        address, city, state and ZIP from the FCC's public license records. The map pin is placed at
        the center of the ZIP — the street address is filled in as text, not looked up on a map. The
        download is the FCC's full amateur-license database (about 200 MB), so it's best on Wi-Fi;
        if interrupted, running it again resumes. Source: FCC Universal Licensing System.
      </>
    ),
    sizeWarning:
      "About 200 MB and a few minutes — best on Wi-Fi, not a phone hotspot. You can cancel and resume later.",
  },
  {
    service: "gmrs",
    packId: "callsigns-us-gmrs",
    title: "GMRS Call Signs (U.S., FCC)",
    infoLabel: "the FCC GMRS call-sign file",
    info: (
      <>
        Fills in the licensee's name, address, city, state and ZIP when a GMRS call sign (such as
        WRAB123) is entered at check-in. GMRS call signs are looked up only here — QRZ and the
        amateur file hold amateur licenses only. One GMRS license covers the licensee's family, so
        the name is the licensee's, who may not be the person on the radio. The map pin is placed at
        the center of the ZIP. The download is about 55 MB; if interrupted, running it again
        resumes. Source: FCC Universal Licensing System.
      </>
    ),
    sizeWarning:
      "About 55 MB — a minute or two on a good connection. You can cancel and resume later.",
  },
];

function formatMB(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

function progressText(p: DatapackProgress): string {
  const pct = p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
  if (p.phase === "downloading") {
    return p.total > 0
      ? `Downloading… ${formatMB(p.done)} of ${formatMB(p.total)} (${pct}%)`
      : `Downloading… ${formatMB(p.done)}`;
  }
  if (p.phase === "reading") return `Reading the FCC data… ${pct}%`;
  return "Saving…";
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : d.toLocaleDateString();
}

type Message = { kind: "ok" | "info" | "error"; text: string };

/**
 * One offline call-sign directory (amateur or GMRS): its status, and download,
 * update and remove. Only one FCC download runs at a time (CALLDIR-035), so
 * `otherBusy` holds this row's buttons back while another row downloads.
 */
export default function CallsignDirectoryRow({
  def,
  otherBusy,
  onBusyChange,
  onChanged,
}: {
  def: CallsignDirectoryDef;
  otherBusy: boolean;
  onBusyChange: (busy: boolean) => void;
  /** The file on disk was downloaded or removed. */
  onChanged?: () => void;
}) {
  const [status, setStatus] = useState<CallsignPackStatus | null>(null);
  const [progress, setProgress] = useState<DatapackProgress | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    api
      .callsignPackStatus(def.service)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [def.service]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen<DatapackProgress>("datapack-progress", (e) => {
      if (e.payload.id === def.packId) setProgress(e.payload);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [def.packId]);

  async function download() {
    setMessage(null);
    setProgress({ id: def.packId, phase: "downloading", done: 0, total: 0 });
    onBusyChange(true);
    try {
      const s = await api.updateCallsignPack(def.service);
      setStatus(s);
      setMessage({ kind: "ok", text: `Done — ${s.record_count.toLocaleString()} call signs` });
    } catch (e) {
      setMessage({
        // Cancelling was the operator's choice, not a failure.
        kind: String(e).startsWith("Cancelled") ? "info" : "error",
        text:
          e === ERR_OFFLINE
            ? offlineMessage("No internet connection — try again when online.")
            : String(e),
      });
    } finally {
      setProgress(null);
      onBusyChange(false);
      onChanged?.();
    }
  }

  async function remove() {
    setMessage(null);
    try {
      setStatus(await api.removeCallsignPack(def.service));
      onChanged?.();
    } catch (e) {
      setMessage({ kind: "error", text: String(e) });
    }
  }

  return (
    <div className="offline-pack-row offline-calls-row">
      <div className="offline-pack-info">
        <h3>
          {def.title}
          <InfoToggle label={def.infoLabel}>{def.info}</InfoToggle>
        </h3>
        {status?.installed ? (
          <>
            <span className="updated-badge">
              Last updated: <strong>{formatUpdated(status.generated_at)}</strong>
            </span>
            <div className="settings-hint">
              {status.record_count.toLocaleString()} licensees · {formatMB(status.size_bytes)}
            </div>
          </>
        ) : (
          <span className="settings-hint">Not downloaded</span>
        )}
        {message?.kind === "ok" && (
          <span className="qrz-status qrz-status-found"> {message.text}</span>
        )}
        {message?.kind === "error" && <span className="weather-area-error"> {message.text}</span>}
        {message?.kind === "info" && <span className="settings-hint"> {message.text}</span>}
        {progress && (
          <div>
            <progress
              className="offline-progress"
              max={progress.total > 0 ? progress.total : undefined}
              value={progress.total > 0 ? progress.done : undefined}
            />
            <span className="settings-hint"> {progressText(progress)}</span>
          </div>
        )}
        {status?.installed && !status.has_street_addresses && !progress && (
          <p className="settings-hint">
            This copy was downloaded before street addresses were included — Update to add them.
          </p>
        )}
        {!progress && <p className="settings-hint">{def.sizeWarning}</p>}
        {otherBusy && !progress && (
          <p className="settings-hint">Waiting for the other call-sign download to finish.</p>
        )}
      </div>
      {progress ? (
        <div className="inline-form">
          <button onClick={() => api.cancelCallsignDownload()}>Cancel</button>
        </div>
      ) : (
        <div className="inline-form">
          <button onClick={download} disabled={otherBusy}>
            {status?.installed ? "Update" : "Download"}
          </button>
          {status?.installed && <button onClick={remove}>Remove</button>}
        </div>
      )}
    </div>
  );
}
