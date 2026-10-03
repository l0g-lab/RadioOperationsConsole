import { useEffect, useState } from "react";
import * as api from "../../api";
import { getVersion } from "@tauri-apps/api/app";
import { checkForUpdate, useUpdateState } from "../../updates";
import type { AppSettings } from "../../types";
import { getThemeMode, setThemeMode, type ThemeMode } from "../../theme";
import {
  FONT_CHOICES,
  TEXT_SIZES,
  getFontChoice,
  getTextSize,
  setFontChoice,
  setTextSize,
  type FontChoice,
  type TextSize,
} from "../../typography";
import { COORD_FORMAT_LABELS, getCoordFormat, setCoordFormat, type CoordFormat } from "../../geo";
import InfoToggle from "../settings/InfoToggle";
import BackupPanel from "../settings/BackupPanel";
import OfflineDataPanel from "../settings/OfflineDataPanel";
import StoragePanel from "../settings/StoragePanel";
import { CloudAlert, CloudDownload, Globe, HardDrive, Package, Palette, Search } from "lucide-react";

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
  const [dirty, setDirty] = useState(false);
  const [coordFormat, setCoordFormatState] = useState<CoordFormat>(getCoordFormat);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode);
  const [font, setFontState] = useState<FontChoice>(getFontChoice);
  const [textSize, setTextSizeState] = useState<TextSize>(getTextSize);
  // Downloading in Offline data changes what Storage measures, and clearing in
  // Storage changes what Offline data shows: each remounts the other.
  const [offlineKey, setOfflineKey] = useState(0);
  const [storageKey, setStorageKey] = useState(0);

  useEffect(() => {
    api
      .getSettings()
      .then(setSettings)
      .catch(() => setSettings(DEFAULT_SETTINGS));
  }, []);

  function updateField<K extends keyof AppSettings>(field: K, value: AppSettings[K]) {
    setSettings((s) => ({ ...s, [field]: value }));
    setSaved(false);
    setDirty(true);
  }

  async function handleSave() {
    await api.saveSettings(settings);
    setSaved(true);
    setDirty(false);
  }

  return (
    <>
      <div className="settings-section-heading">
        <h2>
          <Palette className="heading-icon" />
          Appearance
          <InfoToggle label="appearance">
            Theme (light, dark or system), font, text size, and how coordinates are shown. Changes
            apply right away and are remembered on this computer.
          </InfoToggle>
        </h2>
      </div>
      {/* One setting per row: labels in one column, dropdowns lined up and the
          same width in the next, explanations after. */}
      <div className="panel settings-grid">
        <label htmlFor="pref-theme">Theme:</label>
        <select
          id="pref-theme"
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
        <span />

        <label htmlFor="pref-font">Font:</label>
        <select
          id="pref-font"
          value={font}
          onChange={(e) => {
            const f = e.target.value as FontChoice;
            setFontState(f);
            setFontChoice(f);
          }}
        >
          {(Object.keys(FONT_CHOICES) as FontChoice[]).map((f) => (
            <option key={f} value={f}>
              {FONT_CHOICES[f].label}
            </option>
          ))}
        </select>
        <div>
          <InfoToggle label="font">
            Atkinson Hyperlegible was designed by the Braille Institute so letters that look alike
            (I, l and 1; O and 0) are easy to tell apart — handy for call signs. It comes with the
            app. Wide uses Verdana on Windows and DejaVu Sans on Linux.
          </InfoToggle>
        </div>

        <label htmlFor="pref-text-size">Text size:</label>
        <select
          id="pref-text-size"
          value={textSize}
          onChange={(e) => {
            const size = e.target.value as TextSize;
            setTextSizeState(size);
            setTextSize(size);
          }}
        >
          {(Object.keys(TEXT_SIZES) as TextSize[]).map((size) => (
            <option key={size} value={size}>
              {TEXT_SIZES[size].label}
            </option>
          ))}
        </select>
        <div>
          <InfoToggle label="text size">
            Changes the size of the text only. To make everything bigger or smaller, zoom with
            Ctrl+Shift and + / − (0 resets).
          </InfoToggle>
        </div>

        <label htmlFor="pref-coords">Coordinates:</label>
        <select
          id="pref-coords"
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
        <div>
          <InfoToggle label="coordinate format">
            How coordinates are shown on the check-in, location and map screens. You can type
            coordinates in any of the three formats regardless of this choice.
          </InfoToggle>
        </div>
      </div>

      <div className="settings-section-heading">
        <h2>
          <Globe className="heading-icon" />
          Online services
          <InfoToggle label="online services">
            Optional accounts and keys that add online features. The app works fully without them.
            Changes here are saved with the Save button below.
          </InfoToggle>
        </h2>
      </div>
      <div className="panel">
        <h3>
          <Search className="heading-icon" />
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
            aria-label="QRZ username"
            value={settings.qrz_username}
            onChange={(e) => updateField("qrz_username", e.target.value)}
          />
        </div>
        <div className="inline-form">
          <label>Password:</label>
          <input
            type="password"
            aria-label="QRZ password"
            value={settings.qrz_password}
            onChange={(e) => updateField("qrz_password", e.target.value)}
          />
        </div>
      </div>

      <div className="panel">
        <h3>
          <CloudAlert className="heading-icon" />
          Weather Alerts (NWS)
          <InfoToggle label="weather alerts">
            The National Weather Service alerts API is free and works with no key. Only set one if
            you have a specific reason to (e.g. a higher rate limit).
          </InfoToggle>
        </h3>
        <div className="inline-form">
          <label>API key (optional):</label>
          <input
            aria-label="NWS API key"
            value={settings.nws_api_key}
            onChange={(e) => updateField("nws_api_key", e.target.value)}
          />
        </div>
      </div>

      <div className="panel">
        <div className="inline-form">
          <button className="primary" onClick={handleSave}>
            Save settings
          </button>
          <button
            onClick={() => {
              setSettings(DEFAULT_SETTINGS);
              setSaved(false);
              setDirty(true);
            }}
          >
            Reset to defaults
          </button>
          {dirty && <span className="unsaved-status">Unsaved changes</span>}
          {saved && <span className="qrz-status qrz-status-found">Saved</span>}
        </div>
      </div>

      <div className="settings-section-heading">
        <h2>
          <CloudDownload className="heading-icon" />
          Offline data
          <InfoToggle label="offline data">
            Files kept on this computer so the app works with no internet. Update downloads the
            latest from the public source while you're online, so you can take it to offline
            locations.
          </InfoToggle>
        </h2>
        <p className="settings-hint">These buttons take effect immediately — no need to save.</p>
      </div>
      <OfflineDataPanel key={offlineKey} onChanged={() => setStorageKey((k) => k + 1)} />

      <div className="settings-section-heading">
        <h2>
          <HardDrive className="heading-icon" />
          Storage on this computer
          <InfoToggle label="storage on this computer">
            Downloaded files and cached map tiles the app keeps so it works offline, with how much
            space each takes. Clearing one frees the space; you can download or cache it again later
            while online. Your activities and records aren't listed here and aren't affected.
          </InfoToggle>
        </h2>
      </div>
      <StoragePanel key={storageKey} onCleared={() => setOfflineKey((k) => k + 1)} />

      <div className="settings-section-heading">
        <h2><Package className="heading-icon" />Your data</h2>
      </div>
      <BackupPanel />

      <AppVersion />
    </>
  );
}

/** Which release this is, and a check for a newer one (updates.ts). */
function AppVersion() {
  const [version, setVersion] = useState<string | null>(null);
  const update = useUpdateState();
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);
  if (!version) return null;
  const status =
    update.kind === "checking"
      ? "Checking…"
      : update.kind === "current"
        ? "You have the newest version."
        : update.kind === "available"
          ? `Version ${update.update.version} is available — see the banner at the top.`
          : update.kind === "error" && !update.update
            ? update.message
            : null;
  return (
    <div className="app-version">
      <p className="settings-hint">
        Radio Operations Console {version} · GPL-3.0-or-later · github.com/l0g-lab/RadioOperationsConsole
      </p>
      <p className="settings-hint">
        <button
          className="link-button"
          onClick={() => checkForUpdate(true)}
          disabled={update.kind === "checking" || update.kind === "downloading"}
        >
          Check for updates
        </button>
        {status && <span role="status"> {status}</span>}
      </p>
    </div>
  );
}
