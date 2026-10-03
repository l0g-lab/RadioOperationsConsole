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
