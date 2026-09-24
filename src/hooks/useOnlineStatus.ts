import { useEffect, useState } from "react";

/**
 * Whether the OS reports a network connection. This is link state, not proof
 * that the internet (or any particular service — QRZ, NWS, APRS-IS) is
 * reachable; a captive portal or a dead upstream link can still show "online".
 * Each online feature already fails fast and reports its own offline state
 * (VISION-002/QRZ-031/CIMAP-022); this is a quick, always-on hint, not a
 * substitute for those per-feature checks.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    function goOnline() {
      setOnline(true);
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
