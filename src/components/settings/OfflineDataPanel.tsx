import { useEffect, useState } from "react";
import * as api from "../../api";
import type { DataPackInfo, LicenseService } from "../../types";
import { ERR_OFFLINE } from "../../types";
import InfoToggle from "./InfoToggle";
import CallsignDirectoryRow, { CALLSIGN_DIRECTORIES } from "./CallsignDirectoryRow";

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
 * Offline data the app carries with it: mile-marker road data and the FCC
 * call-sign directories (amateur and GMRS).
 * Everything works from what's already on this machine; "Update" is the
 * online add-on that downloads the latest data from the public source and
 * rebuilds the local copy, so it can be taken to places with no internet.
 */
export default function OfflineDataPanel() {
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
        {CALLSIGN_DIRECTORIES.map((def) => (
          <CallsignDirectoryRow
            key={def.service}
            def={def}
            otherBusy={callsBusy !== null && callsBusy !== def.service}
            onBusyChange={(busy) => setCallsBusy(busy ? def.service : null)}
          />
        ))}
      </div>
    </>
  );
}
