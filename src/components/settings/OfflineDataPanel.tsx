import { useEffect, useState } from "react";
import * as api from "../../api";
import { listen } from "@tauri-apps/api/event";
import type {
  CallsignPackStatus,
  DataPackInfo,
  DatapackProgress,
} from "../../types";
import { ERR_OFFLINE } from "../../types";
import InfoToggle from "./InfoToggle";

// The backend gives up on its own within a minute; this is only a backstop
// so the button can never sit on "Updating…" if something stalls.
const UI_TIMEOUT_MS = 75_000;

type Status =
  | { kind: "working" }
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string };

function coverage(p: DataPackInfo): string {
  if (p.first_mile == null || p.last_mile == null) return "";
  return `MM ${p.first_mile}–${p.last_mile}`;
}

function formatMB(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

function progressText(p: DatapackProgress): string {
  const pct =
    p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
  if (p.phase === "downloading") {
    return p.total > 0
      ? `Downloading… ${formatMB(p.done)} of ${formatMB(p.total)} (${pct}%)`
      : `Downloading… ${formatMB(p.done)}`;
  }
  if (p.phase === "reading") return `Reading the FCC data… ${pct}%`;
  return "Saving…";
}

/** Prominent "last updated" date, so it's obvious at a glance how fresh the data is. */
function UpdatedBadge({ label, iso }: { label: string; iso: string }) {
  return (
    <span className="updated-badge">
      {label}: <strong>{formatUpdated(iso)}</strong>
    </span>
  );
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : d.toLocaleDateString();
}

/**
 * Offline data the app carries with it (currently mile-marker road data).
 * Everything works from what's already on this machine; "Update" is the
 * online add-on that downloads the latest data from the public source and
 * rebuilds the local copy, so it can be taken to places with no internet.
 */
export default function OfflineDataPanel() {
  const [packs, setPacks] = useState<DataPackInfo[]>([]);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [updatingAll, setUpdatingAll] = useState(false);

  // The FCC call-sign directory: a large download, so it's kept separate
  // from the small road files and asks before starting.
  const [calls, setCalls] = useState<CallsignPackStatus | null>(null);
  const [callsConfirming, setCallsConfirming] = useState(false);
  const [callsProgress, setCallsProgress] = useState<DatapackProgress | null>(
    null,
  );
  const [callsMessage, setCallsMessage] = useState<Status | null>(null);

  useEffect(() => {
    api
      .listDataPacks()
      .then(setPacks)
      .catch(() => setPacks([]));
    api
      .callsignPackStatus()
      .then(setCalls)
      .catch(() => setCalls(null));
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen<DatapackProgress>("datapack-progress", (e) => {
      if (e.payload.id === "callsigns-us") setCallsProgress(e.payload);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  async function downloadCalls() {
    setCallsConfirming(false);
    setCallsMessage(null);
    setCallsProgress({
      id: "callsigns-us",
      phase: "downloading",
      done: 0,
      total: 0,
    });
    try {
      const status = await api.updateCallsignPack();
      setCalls(status);
      setCallsMessage({
        kind: "ok",
        text: `Done — ${status.record_count.toLocaleString()} call signs`,
      });
    } catch (e) {
      setCallsMessage({
        kind: "error",
        text:
          e === ERR_OFFLINE
            ? "No internet connection — try again when online."
            : String(e),
      });
    } finally {
      setCallsProgress(null);
    }
  }

  async function removeCalls() {
    setCallsMessage(null);
    try {
      setCalls(await api.removeCallsignPack());
    } catch (e) {
      setCallsMessage({ kind: "error", text: String(e) });
    }
  }

  async function updateOne(id: string) {
    setStatus((s) => ({ ...s, [id]: { kind: "working" } }));
    try {
      const info = await Promise.race([
        api.updateDataPack(id),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject("The update didn't finish — try again."),
            UI_TIMEOUT_MS,
          ),
        ),
      ]);
      setPacks((ps) => ps.map((p) => (p.id === id ? info : p)));
      setStatus((s) => ({
        ...s,
        [id]: {
          kind: "ok",
          text: `Updated — ${info.anchor_count} mile markers`,
        },
      }));
    } catch (e) {
      const text =
        e === ERR_OFFLINE
          ? "No internet connection — try again when online."
          : String(e);
      setStatus((s) => ({ ...s, [id]: { kind: "error", text } }));
    }
  }

  async function updateAll() {
    setUpdatingAll(true);
    // One at a time; a failure on one road doesn't stop the rest.
    for (const p of packs) await updateOne(p.id);
    setUpdatingAll(false);
  }

  const anyWorking = Object.values(status).some((s) => s.kind === "working");

  return (
    <>
      <div className="panel">
        <div className="panel-header-row">
          <h3>
            Mile-Marker Road Data
            <InfoToggle label="mile-marker road data">
              Turns "mile marker 182 on the turnpike" into a map point, with no
              internet needed. Each road is one small file kept on this
              computer. Update while online to download the latest mile-marker
              locations from the Florida Department of Transportation, then take
              it with you to offline locations. Positions are the marker signs'
              recorded locations — nudge the pin if you know better.
            </InfoToggle>
          </h3>
          <button
            onClick={updateAll}
            disabled={updatingAll || anyWorking || packs.length === 0}
          >
            {updatingAll ? "Updating…" : "Update all roads (needs internet)"}
          </button>
        </div>
        {packs.length === 0 && (
          <p className="checkin-empty-state">No data packs found.</p>
        )}
        {packs.map((p) => {
          const st = status[p.id];
          return (
            <div key={p.id} className="offline-pack-row">
              <div className="offline-pack-info">
                <strong>{p.name}</strong>{" "}
                <UpdatedBadge
                  label={
                    p.origin === "downloaded"
                      ? "Last updated"
                      : "Built-in copy from"
                  }
                  iso={p.generated_at}
                />
                <div className="settings-hint">
                  {p.description} · {coverage(p)} · {p.anchor_count} markers
                </div>
                {st?.kind === "ok" && (
                  <span className="qrz-status qrz-status-found">
                    {" "}
                    {st.text}
                  </span>
                )}
                {st?.kind === "error" && (
                  <span className="weather-area-error"> {st.text}</span>
                )}
              </div>
              <button
                onClick={() => updateOne(p.id)}
                disabled={updatingAll || st?.kind === "working"}
              >
                {st?.kind === "working" ? "Updating…" : "Update"}
              </button>
            </div>
          );
        })}
      </div>
      <div className="panel">
        <div className="offline-pack-row offline-calls-row">
          <div className="offline-pack-info">
            <h3>
              Call Signs (U.S., FCC)
              <InfoToggle label="the FCC call-sign file">
                Used only when QRZ isn't available (offline or not set up):
                fills in a check-in's name, address, city, state and ZIP from
                the FCC's public license records. The map pin is placed at the
                center of the ZIP — the street address is filled in as text, not
                looked up on a map. The download is the FCC's full
                amateur-license database (about 200 MB), so it's best on Wi-Fi;
                if interrupted, running it again resumes. Source: FCC Universal
                Licensing System.
              </InfoToggle>
            </h3>
            {calls?.installed ? (
              <>
                <UpdatedBadge label="Last updated" iso={calls.generated_at} />
                <div className="settings-hint">
                  {calls.record_count.toLocaleString()} licensees ·{" "}
                  {formatMB(calls.size_bytes)}
                </div>
              </>
            ) : (
              <span className="settings-hint">Not downloaded</span>
            )}
            {callsMessage?.kind === "ok" && (
              <span className="qrz-status qrz-status-found">
                {" "}
                {callsMessage.text}
              </span>
            )}
            {callsMessage?.kind === "error" && (
              <span className="weather-area-error"> {callsMessage.text}</span>
            )}
            {callsProgress && (
              <div>
                <progress
                  className="offline-progress"
                  max={
                    callsProgress.total > 0 ? callsProgress.total : undefined
                  }
                  value={
                    callsProgress.total > 0 ? callsProgress.done : undefined
                  }
                />
                <span className="settings-hint">
                  {" "}
                  {progressText(callsProgress)}
                </span>
              </div>
            )}
            {calls?.installed &&
              !calls.has_street_addresses &&
              !callsProgress && (
                <p className="settings-hint">
                  This copy was downloaded before street addresses were included
                  — Update to add them.
                </p>
              )}
            {callsConfirming && (
              <p className="settings-hint">
                About 200 MB and a few minutes — best on Wi-Fi, not a phone
                hotspot.
              </p>
            )}
          </div>
          {callsProgress ? null : callsConfirming ? (
            <div className="inline-form">
              <button onClick={downloadCalls}>Download</button>
              <button onClick={() => setCallsConfirming(false)}>Cancel</button>
            </div>
          ) : (
            <div className="inline-form">
              <button onClick={() => setCallsConfirming(true)}>
                {calls?.installed ? "Update" : "Download"}
              </button>
              {calls?.installed && (
                <button onClick={removeCalls}>Remove</button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
