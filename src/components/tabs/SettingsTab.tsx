import { useEffect, useState } from "react";
import * as api from "../../api";
import type { AppSettings } from "../../types";
import { getThemeMode, setThemeMode, type ThemeMode } from "../../theme";
import {
  COORD_FORMAT_LABELS,
  getCoordFormat,
  setCoordFormat,
  type CoordFormat,
} from "../../geo";
import InfoToggle from "../settings/InfoToggle";
import BackupPanel from "../settings/BackupPanel";
import OfflineDataPanel from "../settings/OfflineDataPanel";

const DEFAULT_SETTINGS: AppSettings = {
  nws_api_key: "",
  qrz_username: "",
  qrz_password: "",
  weather_area_query: "",
  weather_area_label: "",
  weather_area_lat: null,
  weather_area_lon: null,
  weather_area_resolved_at: null,
};

export default function SettingsTab() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [coordFormat, setCoordFormatState] = useState<CoordFormat>(getCoordFormat);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => setSettings(DEFAULT_SETTINGS));
  }, []);

  function updateField<K extends keyof AppSettings>(field: K, value: AppSettings[K]) {
    setSettings((s) => ({ ...s, [field]: value }));
    setSaved(false);
  }

  async function handleSave() {
    await api.saveSettings(settings);
    setSaved(true);
  }

  return (
    <>
      <div className="settings-section-heading">
        <h2>
          Appearance
          <InfoToggle label="appearance">
            Theme (light, dark or system) and how coordinates are shown. Changes apply right away and are
            remembered on this computer.
          </InfoToggle>
        </h2>
      </div>
      <div className="panel">
        <div className="inline-form">
          <label>Theme:</label>
          <select
            value={themeMode}
            onChange={(e) => {
              const mode = e.target.value as ThemeMode;
              setThemeModeState(mode);
              setThemeMode(mode);
            }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="inline-form">
          <label>Coordinates:</label>
          <select
            value={coordFormat}
            onChange={(e) => {
              const fmt = e.target.value as CoordFormat;
              setCoordFormatState(fmt);
              setCoordFormat(fmt);
            }}
          >
            {(Object.keys(COORD_FORMAT_LABELS) as CoordFormat[]).map((f) => (
              <option key={f} value={f}>
                {COORD_FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
          <InfoToggle label="coordinate format">
            How coordinates are shown on the check-in, location and map screens. You can type
            coordinates in any of the three formats regardless of this choice.
          </InfoToggle>
        </div>
      </div>

      <div className="settings-section-heading">
        <h2>
          Online services
          <InfoToggle label="online services">
            Optional accounts and keys that add online features. The app works fully without them.
            Changes here are saved with the Save button below.
          </InfoToggle>
        </h2>
      </div>
      <div className="panel">
        <h3>
          QRZ.com Call Sign Lookup
          <InfoToggle label="QRZ.com lookup">
            Auto-fills name, QTH location, grid square, and address when a call sign is entered on
          the Check-ins tab, and seeds a new operator's default location from their call sign.
          Requires a QRZ.com subscription with XML/callbook data access. Leave blank to disable —
          the application works fully without it.
          </InfoToggle>
        </h3>
        <div className="inline-form">
          <label>Username:</label>
          <input
            value={settings.qrz_username}
            onChange={(e) => updateField("qrz_username", e.target.value)}
          />
        </div>
        <div className="inline-form">
          <label>Password:</label>
          <input
            type="password"
            value={settings.qrz_password}
            onChange={(e) => updateField("qrz_password", e.target.value)}
          />
        </div>
      </div>

      <div className="panel">
        <h3>
          Weather Alerts (NWS)
          <InfoToggle label="weather alerts">
            The National Weather Service alerts API is free and works with no key. Only set one if
          you have a specific reason to (e.g. a higher rate limit).
          </InfoToggle>
        </h3>
        <div className="inline-form">
          <label>API key (optional):</label>
          <input
            value={settings.nws_api_key}
            onChange={(e) => updateField("nws_api_key", e.target.value)}
          />
        </div>
      </div>

      <div className="panel">
        <div className="inline-form">
          <button onClick={handleSave}>Save settings</button>
          <button
            onClick={() => {
              setSettings(DEFAULT_SETTINGS);
              setSaved(false);
            }}
          >
            Reset to defaults
          </button>
          {saved && <span className="qrz-status qrz-status-found">Saved</span>}
        </div>
      </div>

      <div className="settings-section-heading">
        <h2>
          Offline data
          <InfoToggle label="offline data">
            Files kept on this computer so the app works with no internet. Update downloads the
            latest from the public source while you're online, so you can take it to offline
            locations.
          </InfoToggle>
        </h2>
        <p className="settings-hint">These buttons take effect immediately — no need to save.</p>
      </div>
      <OfflineDataPanel />

      <div className="settings-section-heading">
        <h2>Your data</h2>
      </div>
      <BackupPanel />
    </>
  );
}
