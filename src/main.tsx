import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { applyThemeMode, getThemeMode } from "./theme";
import { applyTypography } from "./typography";
// The bundled font (typography.ts); its files load only if it's chosen.
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import { getSettings } from "./api";
import { initWorkOffline } from "./workOffline";

applyThemeMode(getThemeMode());
applyTypography();

// No browser autofill: the webview would otherwise offer whatever was typed
// in a box before (an event name in a delete confirmation, say). Set on
// focus, before it can suggest, so every box is covered without each one
// having to say so. Boxes that suggest use our own list (SuggestInput).
document.addEventListener(
  "focusin",
  (e) => {
    const el = e.target;
    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !el.hasAttribute("autocomplete")) {
      el.setAttribute("autocomplete", "off");
    }
  },
  true
);

// Know whether we're working offline before anything renders, so no map tile
// or radar image is fetched in the moment before the saved choice is read.
getSettings()
  .then((s) => initWorkOffline(Boolean(s.work_offline)))
  .catch(() => {})
  .finally(() => {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
