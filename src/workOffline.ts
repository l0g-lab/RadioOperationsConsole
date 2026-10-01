import { useSyncExternalStore } from "react";
import * as api from "./api";

/**
 * The operator's "Work offline" switch (UX-020–UX-026), shared by the header
 * control and by code outside React that would otherwise reach the network
 * from the webview (map tiles, radar). The backend holds the same switch for
 * everything it fetches, and remembers it across restarts.
 */
let workingOffline = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function isWorkingOffline(): boolean {
  return workingOffline;
}

/** Sets the starting state from saved settings, without saving anything. */
export function initWorkOffline(on: boolean) {
  workingOffline = on;
  notify();
}

/** Turns working offline on or off; the backend saves it and enforces it. */
export async function setWorkOffline(on: boolean): Promise<void> {
  await api.setWorkOffline(on);
  workingOffline = on;
  notify();
}

export function subscribeWorkOffline(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useWorkOffline(): boolean {
  return useSyncExternalStore(subscribeWorkOffline, isWorkingOffline);
}

/**
 * What to say when something couldn't go online: whether that's because the
 * operator chose to work offline, or because there's no connection.
 */
export function offlineMessage(noConnection: string): string {
  return isWorkingOffline()
    ? 'You\'re working offline. Click "Working offline" in the header to go back online.'
    : noConnection;
}
