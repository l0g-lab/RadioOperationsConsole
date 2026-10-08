import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, ActivityAlert } from "../../types";
import { useWorkOffline } from "../../workOffline";
import { alertLevel, alertSpanText, areaText, sortAlerts, toAttachedAlert, type NwsAlert } from "../../nwsAlerts";
import { RefreshCw, TriangleAlert } from "lucide-react";

type InEffect = { kind: "loading" } | { kind: "ok"; alerts: NwsAlert[] } | { kind: "error" };

/** One line of the list: an alert kept with the net, one in effect now, or both. */
export interface AlertLine {
  key: string;
  /** The net's copy, when it's attached. */
  attached: ActivityAlert | null;
  /** NWS's alert, when it's in effect now. */
  live: NwsAlert | null;
}

const featuresOf = (v: unknown): NwsAlert[] =>
  ((v as { features?: { properties?: NwsAlert }[] }).features ?? []).map((f) => f.properties ?? {});

const keyOf = (a: NwsAlert) => a.id || `${a.event}|${a.areaDesc}|${a.effective}`;

/**
 * Each alert once: those attached to the net and those in effect now, matched
 * by NWS's id, in the order they took effect.
 */
export function alertLines(attached: ActivityAlert[], live: NwsAlert[]): AlertLine[] {
  const lines = new Map<string, AlertLine>();
  for (const a of attached) lines.set(a.nws_id || a.id, { key: a.nws_id || a.id, attached: a, live: null });
  for (const a of live) {
    const key = keyOf(a);
    const line = lines.get(key);
    if (line) line.live = a;
    else lines.set(key, { key, attached: null, live: a });
  }
  const start = (l: AlertLine) => l.attached?.effective || toAttachedAlert(l.live ?? {}).effective;
  return [...lines.values()].sort((x, y) => start(x).localeCompare(start(y)));
}

/**
 * The NWS alerts in effect now, at the net (its repeater, else net control)
 * and in the Weather tab's area, one copy of each; the net's place alone can
 * miss a warning for another part of the county. Fails only if both fail.
 */
async function alertsInEffect(activity: Activity): Promise<NwsAlert[]> {
  const point =
    activity.repeater_lat != null && activity.repeater_lon != null
      ? { lat: activity.repeater_lat, lon: activity.repeater_lon }
      : activity.location_lat != null && activity.location_lon != null
        ? { lat: activity.location_lat, lon: activity.location_lon }
        : null;
  const fetches = [api.fetchNwsAlerts(), ...(point ? [api.fetchNwsAlerts(point)] : [])];
  const results = await Promise.allSettled(fetches);
  const got = results.flatMap((r) => (r.status === "fulfilled" ? [featuresOf(r.value)] : []));
  if (got.length === 0) throw new Error("unreachable");
  const seen = new Set<string>();
  return sortAlerts(
    got.flat().filter((a) => {
      if (seen.has(keyOf(a))) return false;
      seen.add(keyOf(a));
      return true;
    })
  );
}

/**
 * A SKYWARN net's NWS alerts (SPOT-060): one list of those in effect now and
 * those already kept with the net, each once, ticked to keep it. A kept
 * alert's copy stays after NWS drops it. Works on a closed net too (LIFE-013).
 */
export default function NetAlertsPanel({ activity, operatorId }: { activity: Activity; operatorId: string | null }) {
  const offline = useWorkOffline();
  const [attached, setAttached] = useState<ActivityAlert[]>([]);
  const [inEffect, setInEffect] = useState<InEffect | null>(null);
  const [busy, setBusy] = useState(false);
  // An alert NWS has dropped, about to be unticked: once removed it can't come back.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .listActivityAlerts(activity.id)
      .then(setAttached)
      .catch(() => setAttached([]));

  async function check() {
    setInEffect({ kind: "loading" });
    try {
      setInEffect({ kind: "ok", alerts: await alertsInEffect(activity) });
    } catch {
      setInEffect({ kind: "error" });
    }
  }

  useEffect(() => {
    load();
    setConfirming(null);
    setError(null);
    if (!offline) check();
    else setInEffect(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.id, offline]);

  /** Attaches or removes, one at a time, so a quick double click can't do it twice. */
  async function run(f: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await f();
      setConfirming(null);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function toggle(line: AlertLine) {
    if (line.attached) {
      if (!line.live && confirming !== line.key) setConfirming(line.key);
      else run(() => api.detachActivityAlert(line.attached!.id, operatorId));
    } else if (line.live) {
      const live = line.live;
      run(() => api.attachActivityAlert(activity.id, toAttachedAlert(live), operatorId));
    }
  }

  const lines = alertLines(attached, inEffect?.kind === "ok" ? inEffect.alerts : []);

  let status: React.ReactNode = null;
  if (offline) status = <span className="settings-hint">Working offline — can't see the alerts in effect</span>;
  else if (inEffect?.kind === "loading") status = <span className="settings-hint">Checking…</span>;
  else if (inEffect?.kind === "error") status = <span className="weather-area-error">The weather service couldn't be reached</span>;
  else if (lines.length === 0) status = <span className="settings-hint">No alerts in effect</span>;

  return (
    <div className="net-alerts">
      <div className="net-alerts-header">
        <TriangleAlert className="heading-icon heading-icon-warning" aria-hidden />
        <span className="net-alerts-label">NWS alerts</span>
        <span className="settings-hint">Tick the ones to keep with this net</span>
        {status}
        {!offline && (
          <button onClick={check} disabled={inEffect?.kind === "loading"} title="Check for alerts in effect again">
            <RefreshCw className="button-icon" /> Refresh
          </button>
        )}
      </div>

      {lines.map((line) => {
        const a = line.attached ?? toAttachedAlert(line.live ?? {});
        return (
          <div key={line.key} className={`net-alert-row weather-alert-${alertLevel(a.event)}`} title={a.headline || undefined}>
            <label className="checkbox-row">
              <input type="checkbox" checked={!!line.attached} disabled={busy} onChange={() => toggle(line)} />
              <span className="weather-alert-event">{a.event}</span>
            </label>
            <span className="net-alert-area" title={a.area_desc}>
              {areaText(a.area_desc)}
            </span>
            <span className="settings-hint">
              {alertSpanText(a.effective, a.ends)}
              {line.attached && !line.live && !offline && inEffect?.kind === "ok" ? " · no longer in effect" : ""}
            </span>
            {confirming === line.key && (
              <span className="inline-form confirm-row">
                <span>It's no longer in effect, so it can't be ticked again.</span>
                <button onClick={() => toggle(line)} disabled={busy}>
                  Remove it
                </button>
                <button onClick={() => setConfirming(null)}>Keep it</button>
              </span>
            )}
          </div>
        );
      })}
      {error && <p className="weather-area-error">{error}</p>}
    </div>
  );
}
