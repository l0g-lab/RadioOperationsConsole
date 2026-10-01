import { useState } from "react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { setWorkOffline, useWorkOffline } from "../workOffline";

/**
 * The header's Online/Offline indicator, which is also the "Work offline"
 * switch (UX-020). It keeps the indicator's look rather than becoming a menu:
 * clicking it (or Enter/Space) toggles, and the tooltip says so.
 */
export default function OnlineStatusToggle() {
  const connected = useOnlineStatus();
  const workingOffline = useWorkOffline();
  const [error, setError] = useState<string | null>(null);

  const label = workingOffline ? "Working offline" : connected ? "Online" : "Offline";
  const state = workingOffline
    ? "Working offline: nothing is sent or fetched over the network, even with a connection. Map tiles come from what's already saved."
    : connected
      ? "The operating system reports a network connection. Individual online features (QRZ, weather, APRS-IS, maps) may still be unreachable."
      : "No network connection detected. Offline features keep working; online add-ons (QRZ, weather, APRS-IS, maps, updates) are unavailable.";
  const action = workingOffline
    ? "Click to go back online."
    : "Click to work offline, even while connected.";

  async function toggle() {
    setError(null);
    try {
      await setWorkOffline(!workingOffline);
    } catch (e) {
      setError(`Couldn't change it: ${e}`);
    }
  }

  const variant = workingOffline
    ? "online-pill-working-offline"
    : connected
      ? "online-pill-online"
      : "online-pill-offline";

  return (
    <button
      type="button"
      className={`online-pill ${variant}`}
      aria-pressed={workingOffline}
      aria-label={`${label}. ${action}`}
      title={[state, action, error].filter(Boolean).join(" ")}
      onClick={toggle}
    >
      <span className="online-dot" aria-hidden="true" />
      {label}
    </button>
  );
}
