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
import { ERR_OFFLINE } from "../../types";
import { offlineMessage } from "../../workOffline";
import { Check, Globe, Palette } from "lucide-react";

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

/** A part of Settings another page can send the operator straight to. */
export type SettingsSection = "callsigns" | "roads" | "qrz";

export default function SettingsTab({
  focus = null,
  onFocusHandled,
}: {
  /** Scroll to and highlight this section on opening. */
  focus?: SettingsSection | null;
  onFocusHandled?: () => void;
} = {}) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  // What's saved, to tell whether leaving a box changed anything.
  const [stored, setStored] = useState<AppSettings>(DEFAULT_SETTINGS);
  // Which group was just saved ("qrz", "nws"), for its "Saved" note.
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [qrzCheck, setQrzCheck] = useState<{ kind: "checking" } | { kind: "ok" } | { kind: "error"; text: string } | null>(
    null
  );
  const [coordFormat, setCoordFormatState] = useState<CoordFormat>(getCoordFormat);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode);
  const [font, setFontState] = useState<FontChoice>(getFontChoice);
  const [textSize, setTextSizeState] = useState<TextSize>(getTextSize);
  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s);
        setStored(s);
      })
      .catch(() => setSettings(DEFAULT_SETTINGS));
  }, []);

  useEffect(() => {
    if (!focus) return;
    // After the page (and the offline data list) has laid out.
    setTimeout(() => {
      onFocusHandled?.();
      const el = document.getElementById(`settings-${focus}`);
      if (!el) return;
      el.scrollIntoView?.({ block: "start", behavior: "smooth" });
      el.classList.add("settings-highlight");
      setTimeout(() => el.classList.remove("settings-highlight"), 2500);
    }, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  function updateField<K extends keyof AppSettings>(field: K, value: AppSettings[K]) {
    setSettings((s) => ({ ...s, [field]: value }));
    setSavedNote(null);
    if (field === "qrz_username" || field === "qrz_password") setQrzCheck(null);
  }

  /** Saves on leaving a box, if anything changed (SET-020): no Save button to forget. */
  async function saveIfChanged(group: string): Promise<boolean> {
    if (JSON.stringify(settings) === JSON.stringify(stored)) return true;
    try {
      await api.saveSettings(settings);
      setStored(settings);
      setSavedNote(group);
      setSaveError(null);
      return true;
    } catch (e) {
      setSaveError(String(e));
      return false;
    }
  }

  async function checkQrz() {
    if (!(await saveIfChanged("qrz"))) return;
    setQrzCheck({ kind: "checking" });
    try {
      await api.checkQrzLogin();
      setQrzCheck({ kind: "ok" });
    } catch (e) {
      setQrzCheck({
        kind: "error",
        text: e === ERR_OFFLINE ? offlineMessage("Can't reach QRZ — check the internet connection.") : String(e),
      });
    }
  }

  const savedTag = (group: string) =>
    savedNote === group && (
      <span className="settings-saved">
        <Check aria-hidden /> Saved
      </span>
    );

  return (
    <>
      <div className="settings-columns">
        <div className="operations-column">
          <div className="panel">
            <h3>
              <Palette className="heading-icon" />
              Appearance
              <InfoToggle label="appearance">
                Theme (light, dark or system), font, text size, and how coordinates are shown. Changes
                apply right away and are remembered on this computer.
              </InfoToggle>
            </h3>
            {/* One setting per row: labels in one column, dropdowns lined up and the
                same width in the next, explanations after. */}
            <div className="settings-grid">
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
          </div>

          <div className="panel" id="settings-qrz">
            <h3>
              <Globe className="heading-icon" />
              Online services
              <InfoToggle label="online services">
                Optional accounts and keys that add online features; the app works fully without them.
                Each is saved as you leave its box.
              </InfoToggle>
            </h3>
            <div className="settings-service">
              <strong>
                QRZ.com call-sign lookup
                <InfoToggle label="QRZ.com lookup">
                  Auto-fills name, QTH location, grid square, and address when a call sign is entered on
                  the Check-ins tab, and seeds a new operator's default location from their call sign.
                  Requires a QRZ.com subscription with XML/callbook data access. Leave blank to disable —
                  the application works fully without it.
                </InfoToggle>
              </strong>
              <div className="settings-form-grid">
                <label htmlFor="qrz-username">Username</label>
                <input
                  id="qrz-username"
                  aria-label="QRZ username"
                  value={settings.qrz_username}
                  onChange={(e) => updateField("qrz_username", e.target.value)}
                  onBlur={() => saveIfChanged("qrz")}
                />
                <label htmlFor="qrz-password">Password</label>
                <input
                  id="qrz-password"
                  type="password"
                  aria-label="QRZ password"
                  value={settings.qrz_password}
                  onChange={(e) => updateField("qrz_password", e.target.value)}
                  onBlur={() => saveIfChanged("qrz")}
                />
              </div>
              <div className="inline-form">
                <button
                  onClick={checkQrz}
                  disabled={!settings.qrz_username.trim() || !settings.qrz_password || qrzCheck?.kind === "checking"}
                >
                  {qrzCheck?.kind === "checking" ? "Checking…" : "Check login"}
                </button>
                {qrzCheck?.kind === "ok" && (
                  <span className="qrz-status qrz-status-found" role="status">
                    ✓ QRZ accepted the login for {settings.qrz_username.trim()}
                  </span>
                )}
                {qrzCheck?.kind === "error" && (
                  <span className="weather-area-error" role="status">
                    {qrzCheck.text}
                  </span>
                )}
                {qrzCheck == null && savedTag("qrz")}
              </div>
            </div>
            <div className="settings-service">
              <strong>
                NWS weather API key
                <InfoToggle label="weather alerts">
                  The National Weather Service API is free and works with no key. Only set one if you
                  have a specific reason to (e.g. a higher rate limit).
                </InfoToggle>
              </strong>
              <div className="settings-form-grid">
                <label htmlFor="nws-key">Key (optional)</label>
                <input
                  id="nws-key"
                  aria-label="NWS API key"
                  value={settings.nws_api_key}
                  onChange={(e) => updateField("nws_api_key", e.target.value)}
                  onBlur={() => saveIfChanged("nws")}
                />
              </div>
              {savedTag("nws")}
            </div>
            {saveError && <p className="weather-area-error">Couldn't save: {saveError}</p>}
          </div>
        </div>

        <div className="operations-column">
          <OfflineDataPanel />
          <BackupPanel />
        </div>
      </div>

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
    <p className="app-version settings-hint">
      Radio Operations Console {version} · GPL-3.0-or-later · github.com/l0g-lab/RadioOperationsConsole ·{" "}
      <button
        className="link-button"
        onClick={() => checkForUpdate(true)}
        disabled={update.kind === "checking" || update.kind === "downloading"}
      >
        Check for updates
      </button>
      {status && <span role="status"> {status}</span>}
    </p>
  );
}
