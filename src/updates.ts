import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import * as api from "./api";
import type { InstallerOpened, UpdateInfo } from "./types";
import { isWorkingOffline } from "./workOffline";

/**
 * Checking GitHub for a newer release and installing it: "Update now"
 * downloads the installer for this computer and opens it
 * (src-tauri/src/updates.rs). Never checks while working offline. Shared by
 * the banner that offers an update and the Settings button that checks by
 * hand.
 */
export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  /** A check by hand found nothing newer. */
  | { kind: "current" }
  | { kind: "available"; update: UpdateInfo }
  /** `percent` is null until the size is known. */
  | { kind: "downloading"; update: UpdateInfo; percent: number | null }
  /** Downloaded and opened; `path` is where the file was saved. */
  | { kind: "opened"; update: UpdateInfo; how: InstallerOpened; path: string }
  | { kind: "error"; message: string; update?: UpdateInfo };

let state: UpdateState = { kind: "idle" };
const listeners = new Set<() => void>();

function setState(next: UpdateState) {
  state = next;
  listeners.forEach((fn) => fn());
}

export function getUpdateState(): UpdateState {
  return state;
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state
  );
}

const busy = () => state.kind === "checking" || state.kind === "downloading" || state.kind === "opened";

/**
 * Looks for a newer release. An automatic check stays silent when it can't
 * (working offline, no connection); a check by hand says why.
 */
export async function checkForUpdate(byHand = false): Promise<void> {
  if (busy()) return;
  if (isWorkingOffline()) {
    if (byHand)
      setState({
        kind: "error",
        message: 'You\'re working offline. Click "Working offline" in the header to go back online.',
      });
    return;
  }
  const before = state;
  setState({ kind: "checking" });
  try {
    const update = await api.checkForUpdate();
    if (update) setState({ kind: "available", update });
    else setState(byHand ? { kind: "current" } : { kind: "idle" });
  } catch (e) {
    setState(
      byHand
        ? { kind: "error", message: `Couldn't check for updates: ${e}` }
        : before.kind === "available"
          ? before
          : { kind: "idle" }
    );
  }
}

/** Downloads the installer for this computer and opens it. */
export async function installUpdate(): Promise<void> {
  if (state.kind !== "available" && state.kind !== "error") return;
  const update = state.update;
  if (!update?.installer) return;
  setState({ kind: "downloading", update, percent: null });
  const stop = await listen<{ received: number; total: number }>("update-progress", (e) => {
    const { received, total } = e.payload;
    if (state.kind === "downloading") {
      setState({
        kind: "downloading",
        update,
        percent: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null,
      });
    }
  });
  try {
    const path = await api.downloadUpdate();
    const how = await api.openUpdateInstaller();
    setState({ kind: "opened", update, how, path });
  } catch (e) {
    setState({ kind: "error", update, message: `The update couldn't be installed: ${e}` });
  } finally {
    stop();
  }
}

/** Puts an offered update aside until the next check. */
export function dismissUpdate() {
  if (state.kind === "available" || state.kind === "error" || state.kind === "current" || state.kind === "opened") {
    setState({ kind: "idle" });
  }
}

/** For tests. */
export function resetUpdateState() {
  setState({ kind: "idle" });
}
