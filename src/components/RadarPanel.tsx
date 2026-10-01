import { useEffect, useState } from "react";
import { nearestNexradStation } from "../nexradStations";
import { useWorkOffline } from "../workOffline";

interface Props {
  centerLat: number | null;
  centerLon: number | null;
}

// NWS's own loop.gif responses are cached ~2 minutes at the source; match
// that cadence for auto-refresh (RADAR-007).
const AUTO_REFRESH_MS = 2 * 60 * 1000;

export default function RadarPanel({ centerLat, centerLon }: Props) {
  const station =
    centerLat != null && centerLon != null ? nearestNexradStation(centerLat, centerLon) : "CONUS";
  const [cacheBust, setCacheBust] = useState(() => Date.now());
  const [loadFailed, setLoadFailed] = useState(false);
  const workingOffline = useWorkOffline();

  useEffect(() => {
    const id = setInterval(() => setCacheBust(Date.now()), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  function refresh() {
    setLoadFailed(false);
    setCacheBust(Date.now());
  }

  // NWS's own pre-rendered animated GIF (RADAR-003): no frame timing,
  // compositing, or animation logic of ours — the browser's native GIF
  // decoder plays it, and there's no third-party JS to execute.
  const src = `https://radar.weather.gov/ridge/standard/${station}_loop.gif?_=${cacheBust}`;

  return (
    <div className="radar-panel">
      <div className="inline-form">
        <span className="checkin-roster-count">
          {station === "CONUS" ? "Continental US" : station}
        </span>
        <button onClick={refresh}>Refresh</button>
      </div>
      {workingOffline ? (
        <p className="settings-hint">
          Radar needs the internet, and you're working offline. Click "Working offline" in the
          header to go back online.
        </p>
      ) : loadFailed ? (
        <p className="weather-area-error">
          Couldn't load the radar loop — check your internet connection and try Refresh.
        </p>
      ) : (
        <img
          className="radar-loop-image"
          src={src}
          alt={`Animated radar loop for ${station}`}
          onError={() => setLoadFailed(true)}
        />
      )}
    </div>
  );
}
