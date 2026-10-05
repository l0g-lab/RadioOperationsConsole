import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, CurrentWeather } from "../../types";
import { useWorkOffline } from "../../workOffline";
import { pad2 } from "../../utils";
import { weatherText } from "../../netWeather";
import { alertLevel, sortAlerts, type NwsAlert } from "../../nwsAlerts";
import { CloudSun } from "lucide-react";

type State =
  | { kind: "loading" }
  | { kind: "ok"; now: CurrentWeather | null; alerts: string[]; at: Date }
  | { kind: "error" };

/**
 * A SKYWARN net's weather right now, on one line above its reports (WX-010):
 * the reading nearest the repeater (else net control) and the alerts in
 * effect there. Fetched when shown and on Refresh; never from the Settings
 * weather area.
 */
export default function NetWeatherNow({ activity }: { activity: Activity }) {
  const offline = useWorkOffline();
  const point =
    activity.repeater_lat != null && activity.repeater_lon != null
      ? { lat: activity.repeater_lat, lon: activity.repeater_lon }
      : activity.location_lat != null && activity.location_lon != null
        ? { lat: activity.location_lat, lon: activity.location_lon }
        : null;
  const [state, setState] = useState<State>({ kind: "loading" });

  async function refresh() {
    if (!point) return;
    setState({ kind: "loading" });
    try {
      const [now, alerts] = await Promise.all([
        api.fetchCurrentWeather(point.lat, point.lon),
        api.fetchNwsAlerts(point).then((v) =>
          sortAlerts(((v as { features?: { properties?: NwsAlert }[] }).features ?? []).map((f) => f.properties ?? {}))
        ),
      ]);
      const names = [...new Set(alerts.map((a) => a.event ?? "").filter(Boolean))];
      setState({ kind: "ok", now, alerts: names, at: new Date() });
    } catch {
      setState({ kind: "error" });
    }
  }

  useEffect(() => {
    if (point && !offline) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.id, point?.lat, point?.lon, offline]);

  let body: React.ReactNode;
  if (!point) body = <span className="settings-hint">Not available — no repeater or net control location set</span>;
  else if (offline) body = <span className="settings-hint">Not available — working offline</span>;
  else if (state.kind === "loading") body = <span className="settings-hint">Loading…</span>;
  else if (state.kind === "error")
    body = <span className="settings-hint">The weather service couldn't be reached</span>;
  else
    body = (
      <>
        {state.now ? weatherText(state.now) : <span className="settings-hint">No nearby station has reported</span>}
        {state.alerts.map((a) => (
          <span key={a} className={alertLevel(a) === "danger" ? "net-weather-danger" : "summary-warning"}>
            {" "}
            · {a}
          </span>
        ))}
      </>
    );

  return (
    <div className="net-weather-now">
      <CloudSun className="heading-icon" aria-hidden />
      <span className="net-weather-label">Weather now</span>
      <span className="net-weather-text">{body}</span>
      {point && !offline && (
        <>
          {state.kind === "ok" && (
            <span className="settings-hint">
              {pad2(state.at.getHours())}:{pad2(state.at.getMinutes())}
            </span>
          )}
          <button className="link-button" onClick={refresh} disabled={state.kind === "loading"}>
            Refresh
          </button>
        </>
      )}
    </div>
  );
}
