import { useEffect, useState } from "react";
import * as api from "../../api";
import type { DataPackInfo, LicenseService } from "../../types";
import { ERR_OFFLINE } from "../../types";
import { offlineMessage } from "../../workOffline";
import InfoToggle from "./InfoToggle";
import CallsignDirectoryRow, { CALLSIGN_DIRECTORIES } from "./CallsignDirectoryRow";
import StoragePanel from "./StoragePanel";
import { CloudDownload, Milestone } from "lucide-react";

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

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : d.toLocaleDateString();
}

/**
 * Everything kept on this computer so the app works offline, in one list
 * (SET-030): the FCC call-sign directories (amateur and GMRS), the mile-marker
 * road data, map tiles, unfinished downloads, and safety copies — each with
 * its status and size, and Download, Update, or Clear. Everything works from
 * what's already here; Update downloads the latest from the public source.
 */
export default function OfflineDataPanel() {
  // Downloading or clearing changes what's measured: the storage rows remeasure.
  const [storageKey, setStorageKey] = useState(0);
  const onChanged = () => setStorageKey((k) => k + 1);
  const [showRoads, setShowRoads] = useState(false);
  const [packs, setPacks] = useState<DataPackInfo[]>([]);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [updatingAll, setUpdatingAll] = useState(false);

  // The FCC call-sign directories: large downloads, so they're kept separate
  // from the small road files, ask before starting, and run one at a time.
  const [callsBusy, setCallsBusy] = useState<LicenseService | null>(null);

  useEffect(() => {
    api
      .listDataPacks()
      .then(setPacks)
      .catch(() => setPacks([]));
  }, []);

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
      onChanged?.();
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
          ? offlineMessage("No internet connection — try again when online.")
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

  const downloaded = packs.filter((p) => p.origin === "downloaded");
  const newest = downloaded.map((p) => p.generated_at).sort().pop();
  const roadsStatus =
    packs.length === 0
      ? "None found"
      : `${packs.length} road${packs.length === 1 ? "" : "s"} · ${
          downloaded.length === 0
            ? `built-in copy from ${formatUpdated(packs.map((p) => p.generated_at).sort()[0])}`
            : `updated ${formatUpdated(newest as string)}${downloaded.length < packs.length ? ` (${downloaded.length} of ${packs.length})` : ""}`
        }`;
  const roadErrors = packs.filter((p) => status[p.id]?.kind === "error").length;

  return (
    <div className="panel offline-data-panel">
      <h3>
        <CloudDownload className="heading-icon" />
        Offline data
        <InfoToggle label="offline data">
          Files kept on this computer so the app works with no internet, with how much space each
          takes. Download and Update fetch the latest from the public source while you're online, so
          you can take it to places with none. Clearing frees the space; you can get it again later.
          Your activities and records aren't here and aren't affected. Changes here take effect at
          once.
        </InfoToggle>
      </h3>
      <div id="settings-callsigns">
        {CALLSIGN_DIRECTORIES.map((def) => (
          <CallsignDirectoryRow
            key={def.service}
            def={def}
            otherBusy={callsBusy !== null && callsBusy !== def.service}
            onBusyChange={(busy) => setCallsBusy(busy ? def.service : null)}
            onChanged={onChanged}
          />
        ))}
      </div>
      <div className="offline-pack-row" id="settings-roads" role="group" aria-label="Mile-marker roads">
        <div className="offline-pack-info">
          {/* Update all is on this line, so opening the road list or the
              information below doesn't move it. */}
          <div className="offline-pack-head">
            <Milestone className="offline-row-icon" aria-hidden />
            <strong>Mile-marker roads</strong>
            <InfoToggle label="mile-marker road data">
              Turns "mile marker 182 on the turnpike" into a map point, with no internet needed. Each road
              is one small file kept on this computer. Update while online to download the latest
              mile-marker locations from the Florida Department of Transportation, then take it with you
              to offline locations. Positions are the marker signs' recorded locations — nudge the pin if
              you know better.
            </InfoToggle>
            <span className="settings-hint">{roadsStatus}</span>
            {roadErrors > 0 && !showRoads && (
              <span className="weather-area-error">{roadErrors} couldn't update — Show roads for why.</span>
            )}
            <button
              className="offline-pack-head-action"
              onClick={updateAll}
              disabled={updatingAll || anyWorking || packs.length === 0}
            >
              {updatingAll ? "Updating…" : "Update all"}
            </button>
          </div>
          <div>
            <button className="link-button" onClick={() => setShowRoads((v) => !v)} aria-expanded={showRoads}>
              {showRoads ? "Hide roads" : "Show roads"}
            </button>
          </div>
          {showRoads && (
            <ul className="offline-roads">
              {packs.map((p) => {
                const st = status[p.id];
                return (
                  <li key={p.id} className="offline-road">
                    <span>
                      {p.name}{" "}
                      <span className="settings-hint">
                        {p.origin === "downloaded" ? "updated" : "built-in"} {formatUpdated(p.generated_at)}
                        {coverage(p) ? ` · ${coverage(p)}` : ""} · {p.anchor_count} markers
                      </span>
                      {st?.kind === "ok" && <span className="qrz-status qrz-status-found"> {st.text}</span>}
                      {st?.kind === "error" && <span className="weather-area-error"> {st.text}</span>}
                    </span>
                    <button
                      className="link-button"
                      onClick={() => updateOne(p.id)}
                      disabled={updatingAll || st?.kind === "working"}
                    >
                      {st?.kind === "working" ? "Updating…" : "Update"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <StoragePanel
        key={storageKey}
        only={["road-data", "map-tiles", "partial-downloads", "restore-copies"]}
        onCleared={() => {
          // Clearing road updates goes back to the built-in copies.
          api.listDataPacks().then(setPacks).catch(() => {});
        }}
      />
    </div>
  );
}
