import { useEffect, useState } from "react";
import * as api from "../../api";
import type { AppSettings } from "../../types";
import { ERR_OFFLINE } from "../../types";
import { offlineMessage } from "../../workOffline";
import { pad2 } from "../../utils";
import RadarPanel from "../RadarPanel";
import LocationPicker from "../LocationPicker";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Crosshair,
  Droplets,
  Moon,
  Radar,
  Sun,
  Thermometer,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { conditionOf, precipLevel, tempBand, windLevel, type Condition } from "../../forecastStyle";

interface NwsFeature {
  properties?: {
    event?: string;
    severity?: string;
    areaDesc?: string;
    headline?: string;
    description?: string;
    effective?: string;
  };
}

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

/**
 * One forecast period, colored by its conditions, temperature, chance of
 * rain, and wind (forecastStyle.ts). The words are always there too, so
 * nothing depends on color alone.
 */
function ForecastPeriod({ p }: { p: NwsForecastPeriod }) {
  const condition = conditionOf(p.shortForecast);
  const night = p.isDaytime === false;
  const { day, night: nightIcon, label } = CONDITION_ICONS[condition];
  const Icon = night ? nightIcon : day;
  const precip = p.probabilityOfPrecipitation?.value;
  return (
    <div className={`alert-card forecast-card forecast-${condition}${night ? " forecast-night" : ""}`}>
      <div className="forecast-head">
        <Icon
          className="forecast-icon"
          role={label ? "img" : undefined}
          aria-label={label || undefined}
          aria-hidden={!label}
        />
        <strong>{p.name}</strong>
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
      </div>
      {p.shortForecast && <p className="forecast-short">{p.shortForecast}</p>}
      {p.detailedForecast && <p className="settings-hint">{p.detailedForecast}</p>}
    </div>
  );
}

function severityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case "extreme":
      return "#8B0000";
    case "severe":
      return "#FF4500";
    case "moderate":
      return "#FFA500";
    case "minor":
      return "#9ACD32";
    default:
      return "#808080";
  }
}

/** "Fetched 19:04" (local time), so it's clear how fresh what's shown is. */
function FetchedAt({ at }: { at: Date | null }) {
  if (!at) return null;
  return (
    <span className="settings-hint">
      Fetched {pad2(at.getHours())}:{pad2(at.getMinutes())}
    </span>
  );
}

export default function WeatherTab() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [nwsLoading, setNwsLoading] = useState(false);
  const [features, setFeatures] = useState<NwsFeature[] | null>(null);
  const [nwsError, setNwsError] = useState<string | null>(null);

  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastPeriods, setForecastPeriods] = useState<NwsForecastPeriod[] | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);

  const [areaQuery, setAreaQuery] = useState("");
  const [areaResolving, setAreaResolving] = useState(false);
  const [areaError, setAreaError] = useState<string | null>(null);
  const [showAreaPicker, setShowAreaPicker] = useState(false);

  const [showRadar, setShowRadar] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  // When each was last fetched, shown beside its Refresh (NWSA-013).
  const [alertsFetchedAt, setAlertsFetchedAt] = useState<Date | null>(null);
  const [forecastFetchedAt, setForecastFetchedAt] = useState<Date | null>(null);

  const areaSet = settings?.weather_area_lat != null;

  // Opening a section is the request to fetch it, so it fetches at once
  // (NWSA-013, NWSA-022); nothing fetches while a section is closed.
  function toggleAlerts() {
    const next = !showAlerts;
    setShowAlerts(next);
    if (next) handleFetchNws();
  }

  function toggleForecast() {
    const next = !showForecast;
    setShowForecast(next);
    if (next && areaSet) handleFetchForecast();
  }

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s);
        setAreaQuery(s.weather_area_query);
      })
      .catch(() => setSettings(null));
  }, []);

  async function handleFetchNws() {
    setNwsLoading(true);
    setNwsError(null);
    try {
      const v = (await api.fetchNwsAlerts()) as { features?: NwsFeature[] };
      setFeatures(Array.isArray(v.features) ? v.features : []);
      setAlertsFetchedAt(new Date());
    } catch (e) {
      setNwsError(String(e));
    } finally {
      setNwsLoading(false);
    }
  }

  async function handleFetchForecast() {
    setForecastLoading(true);
    setForecastError(null);
    try {
      const v = (await api.fetchNwsForecast()) as { properties?: { periods?: NwsForecastPeriod[] } };
      setForecastPeriods(v.properties?.periods ?? []);
      setForecastFetchedAt(new Date());
    } catch (e) {
      setForecastError(String(e));
    } finally {
      setForecastLoading(false);
    }
  }

  async function handleSetArea() {
    setAreaResolving(true);
    setAreaError(null);
    try {
      const updated = await api.setWeatherArea(areaQuery);
      setSettings(updated);
      setAreaQuery(updated.weather_area_query);
    } catch (e) {
      setAreaError(
        e === ERR_OFFLINE
          ? offlineMessage(
              "Can't resolve that location without an internet connection. Try again when online."
            )
          : String(e)
      );
    } finally {
      setAreaResolving(false);
    }
  }

  async function handleSaveAreaPin(lat: number, lon: number, label: string) {
    setAreaResolving(true);
    setAreaError(null);
    try {
      const updated = await api.setWeatherAreaCoords(lat, lon, label || null);
      setSettings(updated);
      setAreaQuery(updated.weather_area_query);
      setShowAreaPicker(false);
    } catch (e) {
      setAreaError(String(e));
    } finally {
      setAreaResolving(false);
    }
  }

  async function handleClearArea() {
    setAreaResolving(true);
    setAreaError(null);
    try {
      const updated = await api.setWeatherArea("");
      setSettings(updated);
      setAreaQuery("");
    } catch (e) {
      setAreaError(String(e));
    } finally {
      setAreaResolving(false);
    }
  }

  return (
    <>
      <div className="panel">
        <h3><Crosshair className="heading-icon" />Area of Interest</h3>
        <p className="settings-hint">
          Enter a zip code, city/state, address, or landmark — or pick a point on a map or type
          coordinates, which works without an internet connection. Alerts and radar below will be
          scoped and centered on that location instead of the whole country. Leave it unset to
          fetch all active alerts and show the national radar view.
        </p>
        <div className="inline-form">
          <input
            placeholder="e.g. 79936, or El Paso, TX"
            value={areaQuery}
            onChange={(e) => setAreaQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSetArea();
            }}
          />
          <button onClick={handleSetArea} disabled={areaResolving || !areaQuery.trim()}>
            {areaResolving ? "Resolving…" : "Set area"}
          </button>
          <button onClick={() => setShowAreaPicker(true)} disabled={areaResolving}>
            Pick on map
          </button>
          {settings?.weather_area_lat != null && (
            <button onClick={handleClearArea} disabled={areaResolving}>
              Clear
            </button>
          )}
        </div>
        {areaError && <p className="weather-area-error">{areaError}</p>}
        {settings?.weather_area_lat != null && settings.weather_area_lon != null ? (
          <p className="weather-area-status">
            Scoped to: <strong>{settings.weather_area_label}</strong> (
            {settings.weather_area_lat.toFixed(3)}, {settings.weather_area_lon.toFixed(3)})
          </p>
        ) : (
          <p className="weather-area-status">
            No area set — alerts and radar are unscoped (nationwide).
          </p>
        )}
      </div>

      <div className="panel">
        <div className="panel-header-row">
          <h3><CloudSun className="heading-icon" />Current Forecast (NWS)</h3>
          <button className="link-button" onClick={toggleForecast}>
            {showForecast ? "Hide forecast" : "Show forecast"}
          </button>
        </div>
        {showForecast &&
          (!areaSet ? (
            <p className="checkin-empty-state">
              Set an area of interest above to fetch its forecast — a forecast is always for a
              specific place, unlike alerts.
            </p>
          ) : (
            <>
              <div className="inline-form">
                <button
                  onClick={handleFetchForecast}
                  disabled={forecastLoading}
                  aria-label="Refresh forecast"
                >
                  {forecastLoading ? "Fetching…" : "Refresh"}
                </button>
                <FetchedAt at={forecastFetchedAt} />
              </div>
              {forecastError && (
                <p className="weather-area-error">Couldn't fetch forecast: {forecastError}</p>
              )}
              {forecastPeriods && forecastPeriods.length === 0 && (
                <p className="checkin-empty-state">No forecast periods returned.</p>
              )}
              {forecastPeriods && forecastPeriods.length > 0 && (
                <div className="alert-list">
                  {forecastPeriods.map((p, idx) => (
                    <ForecastPeriod p={p} key={idx} />
                  ))}
                </div>
              )}
            </>
          ))}
      </div>

      <div className="panel">
        <div className="panel-header-row">
          <h3><TriangleAlert className="heading-icon heading-icon-warning" />Active Alerts (NWS)</h3>
          <button className="link-button" onClick={toggleAlerts}>
            {showAlerts ? "Hide alerts" : "Show alerts"}
          </button>
        </div>
        {showAlerts && (
          <>
            <div className="inline-form">
              <button onClick={handleFetchNws} disabled={nwsLoading} aria-label="Refresh alerts">
                {nwsLoading ? "Fetching…" : "Refresh"}
              </button>
              <FetchedAt at={alertsFetchedAt} />
            </div>
            {nwsError && <p className="weather-area-error">Couldn't fetch alerts: {nwsError}</p>}
            {features && features.length === 0 && (
              <p className="checkin-empty-state">No active alerts found.</p>
            )}
            {features && features.length > 0 && (
              <div className="alert-list">
                {features.map((feat, idx) => {
                  const p = feat.properties ?? {};
                  const severity = p.severity ?? "Unknown";
                  return (
                    <div className="alert-card" key={idx}>
                      <div>
                        <span style={{ color: severityColor(severity) }}>{severity}</span>
                        {p.event && <span> — {p.event}</span>}
                        {p.areaDesc && <span> — {p.areaDesc}</span>}
                      </div>
                      {p.headline && <h4>{p.headline}</h4>}
                      {p.description && <p>{p.description}</p>}
                      {p.effective && <p>Effective: {p.effective}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <div className="panel-header-row">
          <h3><Radar className="heading-icon" />Radar</h3>
          <button className="link-button" onClick={() => setShowRadar((v) => !v)}>
            {showRadar ? "Hide radar" : "Show radar"}
          </button>
        </div>
        {showRadar && (
          <RadarPanel
            centerLat={settings?.weather_area_lat ?? null}
            centerLon={settings?.weather_area_lon ?? null}
          />
        )}
      </div>

      {showAreaPicker && (
        <LocationPicker
          title="Weather area of interest"
          initialLat={settings?.weather_area_lat ?? null}
          initialLon={settings?.weather_area_lon ?? null}
          initialLabel={settings?.weather_area_label ?? ""}
          onSave={handleSaveAreaPin}
          onClear={settings?.weather_area_lat != null ? handleClearArea : undefined}
          onClose={() => setShowAreaPicker(false)}
        />
      )}
    </>
  );
}
