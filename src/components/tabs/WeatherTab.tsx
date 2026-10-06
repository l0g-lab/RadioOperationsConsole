import { useEffect, useState } from "react";
import * as api from "../../api";
import type { AppSettings, CurrentWeather } from "../../types";
import { ERR_OFFLINE } from "../../types";
import { offlineMessage, useWorkOffline } from "../../workOffline";
import { pad2 } from "../../utils";
import RadarMap, { RADAR_REFRESH_MS } from "../weather/RadarMap";
import LocationPicker from "../LocationPicker";
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Info,
  MapPin,
  Moon,
  Radar,
  RefreshCw,
  Sun,
  Thermometer,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { conditionOf, precipLevel, tempBand, windLevel, type Condition } from "../../forecastStyle";
import { fahrenheit, windText } from "../../netWeather";
import { alertLevel, areaText, paragraphs, sortAlerts, untilText, type NwsAlert } from "../../nwsAlerts";

interface NwsForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
  detailedForecast?: string;
  probabilityOfPrecipitation?: { value?: number | null };
  isDaytime?: boolean;
}

const CONDITION_ICONS: Record<Condition, { day: LucideIcon; night: LucideIcon; label: string }> = {
  storm: { day: CloudLightning, night: CloudLightning, label: "Thunderstorms" },
  winter: { day: CloudSnow, night: CloudSnow, label: "Snow or ice" },
  rain: { day: CloudRain, night: CloudRain, label: "Rain" },
  fog: { day: CloudFog, night: CloudFog, label: "Fog or haze" },
  cloudy: { day: Cloud, night: Cloud, label: "Cloudy" },
  partly: { day: CloudSun, night: CloudMoon, label: "Partly cloudy" },
  clear: { day: Sun, night: Moon, label: "Clear" },
  other: { day: Cloud, night: Cloud, label: "" },
};

/** Periods shown before "Show all 7 days": today and tomorrow, day and night. */
const FORECAST_SHOWN = 4;

const hm = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/**
 * One forecast period on a line, colored by its conditions, temperature,
 * chance of rain, and wind (forecastStyle.ts); the ⓘ button opens NWS's full
 * wording under it. The words are always there too, so nothing depends on color.
 */
function ForecastRow({ p }: { p: NwsForecastPeriod }) {
  const [open, setOpen] = useState(false);
  const condition = conditionOf(p.shortForecast);
  const night = p.isDaytime === false;
  const { day, night: nightIcon, label } = CONDITION_ICONS[condition];
  const Icon = night ? nightIcon : day;
  const precip = p.probabilityOfPrecipitation?.value;
  return (
    <div className={`forecast-row forecast-${condition}${night ? " forecast-night" : ""}`}>
      <Icon className="forecast-icon" role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={!label} />
      <strong className="forecast-name">{p.name}</strong>
      <span className="forecast-chips">
        {p.temperature != null && (
          <span className={`forecast-chip temp-${tempBand(p.temperature, p.temperatureUnit)}`}>
            <Thermometer aria-hidden />
            {p.temperature}°{p.temperatureUnit}
          </span>
        )}
        {precip != null && (
          <span className={`forecast-chip precip-${precipLevel(precip)}`} title="Chance of precipitation">
            <Droplets aria-hidden />
            {precip}%
          </span>
        )}
        {p.windSpeed && (
          <span className={`forecast-chip wind-${windLevel(p.windSpeed)}`}>
            <Wind aria-hidden />
            {p.windDirection} {p.windSpeed}
          </span>
        )}
      </span>
      <span className="forecast-short">{p.shortForecast}</span>
      {p.detailedForecast ? (
        <button
          className={"icon-button" + (open ? " active" : "")}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} the full forecast for ${p.name}`}
          title={open ? "Hide details" : "Details"}
        >
          <Info />
        </button>
      ) : (
        <span />
      )}
      {open && <p className="forecast-detail">{p.detailedForecast}</p>}
    </div>
  );
}

/** One alert on a line (red for a warning, amber otherwise); click for NWS's full text. */
function AlertRow({ a }: { a: NwsAlert }) {
  const [open, setOpen] = useState(false);
  const level = alertLevel(a.event);
  const until = untilText(a);
  const area = areaText(a.areaDesc);
  return (
    <div className={`weather-alert weather-alert-${level}`}>
      <button className="weather-alert-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown className="weather-alert-chevron" /> : <ChevronRight className="weather-alert-chevron" />}
        <TriangleAlert className="weather-alert-icon" aria-hidden />
        <span className="weather-alert-event">{a.event ?? "Alert"}</span>
        {until && <span className="weather-alert-until">{until}</span>}
      </button>
      {area && (
        <div className="weather-alert-area" title={a.areaDesc}>
          {area}
        </div>
      )}
      {open && (
        <div className="weather-alert-text">
          {a.headline && <p className="weather-alert-headline">{a.headline}</p>}
          {paragraphs(a.description).map((t, i) => (
            <p key={i}>{t}</p>
          ))}
          {paragraphs(a.instruction).map((t, i) => (
            <p key={`i${i}`} className="weather-alert-instruction">
              {t}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Setting the area: a place to look up online, or a spot on the map (works offline). */
function AreaEditor({
  settings,
  onSaved,
  onCancel,
}: {
  settings: AppSettings;
  onSaved: (s: AppSettings) => void;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState(settings.weather_area_query);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const isSet = settings.weather_area_lat != null;

  async function run(f: () => Promise<AppSettings>, failText: (e: unknown) => string) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await f());
      setPicking(false);
    } catch (e) {
      setError(failText(e));
    } finally {
      setBusy(false);
    }
  }

  const setByName = () =>
    run(
      () => api.setWeatherArea(query),
      (e) =>
        e === ERR_OFFLINE
          ? offlineMessage("Can't look that place up without an internet connection — pick it on the map instead.")
          : String(e)
    );

  return (
    <div className="weather-area-editor">
      <p className="settings-hint">
        A ZIP code, town, address, or landmark — or pick the spot on the map, which works offline.
      </p>
      <div className="inline-form">
        <input
          aria-label="Weather area"
          placeholder="e.g. 32801, or Orlando, FL"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) setByName();
          }}
          autoFocus
        />
        <button className="primary" onClick={setByName} disabled={busy || !query.trim()}>
          {busy ? "Looking up…" : "Set area"}
        </button>
        <button onClick={() => setPicking(true)} disabled={busy}>
          <MapPin className="button-icon" /> Map
        </button>
        {isSet && (
          <button onClick={() => run(() => api.setWeatherArea(""), String)} disabled={busy}>
            Clear
          </button>
        )}
        {onCancel && <button onClick={onCancel}>Cancel</button>}
      </div>
      {error && <p className="weather-area-error">{error}</p>}
      {picking && (
        <LocationPicker
          title="Weather area"
          initialLat={settings.weather_area_lat ?? null}
          initialLon={settings.weather_area_lon ?? null}
          initialLabel={settings.weather_area_label ?? ""}
          onSave={(lat, lon, label) => run(() => api.setWeatherAreaCoords(lat, lon, label || null), String)}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/** One fetch's state: what came back, or that it failed (NWS's own message on hovering). */
type Fetched<T> = { data: T } | { error: string } | null;

function failed<T>(f: Fetched<T>): f is { error: string } {
  return f != null && "error" in f;
}

/**
 * The Weather tab: what it's doing now, the forecast, alerts, and radar for
 * the weather area. Opening the tab fetches them (NWSA-013); Refresh fetches
 * again. Radar is a map of its own below, starting on the latest scan.
 */
export default function WeatherTab() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [editingArea, setEditingArea] = useState(false);
  const offline = useWorkOffline();

  const [now, setNow] = useState<Fetched<CurrentWeather | null>>(null);
  const [forecast, setForecast] = useState<Fetched<NwsForecastPeriod[]>>(null);
  const [alerts, setAlerts] = useState<Fetched<NwsAlert[]>>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // When the alerts were last checked (they're checked every five minutes too).
  const [alertsAt, setAlertsAt] = useState<Date | null>(null);
  const [showAllForecast, setShowAllForecast] = useState(false);

  const lat = settings?.weather_area_lat ?? null;
  const lon = settings?.weather_area_lon ?? null;
  const areaSet = lat != null && lon != null;
  const areaName = settings ? settings.weather_area_query.trim() || settings.weather_area_label : "";

  useEffect(() => {
    api
      .getSettings()
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);

  /** The alerts in effect for the area, most serious first, each with its area to outline. */
  const fetchAlerts = () =>
    api.fetchNwsAlerts().then((v) =>
      sortAlerts(
        ((v as { features?: { properties?: NwsAlert; geometry?: NwsAlert["geometry"] }[] }).features ?? []).map(
          (x) => ({ ...(x.properties ?? {}), geometry: x.geometry ?? null })
        )
      )
    );

  async function refresh() {
    if (lat == null || lon == null) return;
    setLoading(true);
    const wrap = <T,>(p: Promise<T>): Promise<Fetched<T>> =>
      p.then((data) => ({ data })).catch((e) => ({ error: String(e) }));
    const [n, f, a] = await Promise.all([
      wrap(api.fetchCurrentWeather(lat, lon)),
      wrap(
        api
          .fetchNwsForecast()
          .then((v) => (v as { properties?: { periods?: NwsForecastPeriod[] } }).properties?.periods ?? [])
      ),
      wrap(fetchAlerts()),
    ]);
    setNow(n);
    setForecast(f);
    setAlerts(a);
    setUpdatedAt(new Date());
    if (a && !("error" in a)) setAlertsAt(new Date());
    setLoading(false);
  }

  // While the tab is open and online, the alerts are checked again every five
  // minutes, with the radar (NWSA-017), so a new warning appears on its own.
  // A failed check keeps the list as it was.
  useEffect(() => {
    if (!areaSet || offline) return;
    const id = setInterval(() => {
      fetchAlerts()
        .then((list) => {
          setAlerts({ data: list });
          setAlertsAt(new Date());
        })
        .catch(() => {});
    }, RADAR_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, offline]);

  // Opening the tab, setting the area, or going back online fetches it all.
  useEffect(() => {
    if (areaSet && !offline) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, offline]);

  if (!settings) return null;

  if (!areaSet) {
    return (
      <div className="panel">
        <h3>
          <CloudSun className="heading-icon" />
          Weather
        </h3>
        <p>Set your area to see the current conditions, forecast, alerts, and radar there.</p>
        <AreaEditor settings={settings} onSaved={setSettings} />
      </div>
    );
  }

  const shownForecast = failed(forecast) || !forecast ? [] : forecast.data;
  const alertList = alerts && !failed(alerts) ? alerts.data : null;
  const unreachable = "The weather service couldn't be reached — try Refresh.";

  return (
    <div className="weather-tab">
      <div className="panel">
        <div className="panel-header-row">
          <h3>
            <CloudSun className="heading-icon" />
            Weather — {areaName}
          </h3>
          <div className="checkin-roster-header-actions">
            {updatedAt && !offline && <span className="settings-hint">Updated {hm(updatedAt)}</span>}
            <button onClick={refresh} disabled={loading || offline}>
              <RefreshCw className="button-icon" /> {loading ? "Updating…" : "Refresh"}
            </button>
            {!editingArea && (
              <button className="link-button" onClick={() => setEditingArea(true)}>
                Change area
              </button>
            )}
          </div>
        </div>
        {editingArea && (
          <AreaEditor
            settings={settings}
            onSaved={(s) => {
              setSettings(s);
              setEditingArea(false);
            }}
            onCancel={() => setEditingArea(false)}
          />
        )}
        {offline && (
          <p className="settings-hint">
            {offlineMessage("")} The weather needs the internet.
          </p>
        )}
      </div>

      {!offline && (
        <div className="weather-workspace">
          <div className="operations-column">
            <div className="panel">
              <div className="panel-header-row">
              <h3>
                <Thermometer className="heading-icon" />
                Now
              </h3>
              {/* Who reported it and when, beside the heading, so the reading has its line to itself. */}
              {now && !failed(now) && now.data && (
                <span
                  className="settings-hint"
                  title={`${now.data.station_id}${now.data.station_name ? ` ${now.data.station_name}` : ""}`}
                >
                  {now.data.station_id} · reported {hm(new Date(now.data.observed_at))}
                </span>
              )}
            </div>
              {failed(now) ? (
                <p className="weather-area-error" title={now.error}>
                  {unreachable}
                </p>
              ) : now?.data ? (
                <div className="weather-now-main">
                  {now.data.temp_c != null && <span className="weather-now-temp">{fahrenheit(now.data.temp_c)}</span>}
                  <span>{now.data.conditions}</span>
                  {windText(now.data) && <span className="weather-now-wind">{windText(now.data)}</span>}
                </div>
              ) : now ? (
                <p className="settings-hint">No nearby weather station has reported in the last 90 minutes.</p>
              ) : (
                <p className="settings-hint">Loading…</p>
              )}
            </div>

            <div className="panel">
              <div className="panel-header-row">
                <h3>
                  <TriangleAlert className="heading-icon heading-icon-warning" />
                  Alerts{alertList && alertList.length > 0 ? ` (${alertList.length})` : ""}
                </h3>
                {alertsAt && (
                  <span className="settings-hint" title="Checked again every five minutes while this tab is open">
                    checked {hm(alertsAt)}
                  </span>
                )}
              </div>
              {failed(alerts) ? (
                <p className="weather-area-error" title={alerts.error}>
                  {unreachable}
                </p>
              ) : !alertList ? (
                <p className="settings-hint">Loading…</p>
              ) : alertList.length === 0 ? (
                <p className="settings-hint">No alerts in effect.</p>
              ) : (
                <div className="weather-alert-list">
                  {alertList.map((a, i) => (
                    <AlertRow a={a} key={`${a.event}-${i}`} />
                  ))}
                </div>
              )}
            </div>

            <div className="panel">
              <h3>
                <CloudSun className="heading-icon" />
                Forecast
              </h3>
              {failed(forecast) ? (
                <p className="weather-area-error" title={forecast.error}>
                  {unreachable}
                </p>
              ) : !forecast ? (
                <p className="settings-hint">Loading…</p>
              ) : shownForecast.length === 0 ? (
                <p className="settings-hint">No forecast given for this area.</p>
              ) : (
                <>
                  <div className="forecast-list">
                    {(showAllForecast ? shownForecast : shownForecast.slice(0, FORECAST_SHOWN)).map((p, i) => (
                      <ForecastRow p={p} key={i} />
                    ))}
                  </div>
                  {shownForecast.length > FORECAST_SHOWN && (
                    <button className="link-button" onClick={() => setShowAllForecast((v) => !v)}>
                      {showAllForecast ? "Show fewer" : "Show all 7 days"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="operations-column">
            {/* The whole right column, filling the window's height: zoom, pan, Full view (RADAR-001). */}
            <div className="panel radar-panel-fill">
              <h3>
                <Radar className="heading-icon" />
                Radar
              </h3>
              <RadarMap lat={lat as number} lon={lon as number} alerts={alertList ?? []} offline={offline} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
