import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateInfo } from "./types";

// The progress listener the download reports to.
let onProgress: ((e: { payload: { received: number; total: number } }) => void) | null = null;
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_name: string, fn: typeof onProgress) => {
    onProgress = fn;
    return () => {
      onProgress = null;
    };
  }),
}));
vi.mock("./api", () => ({
  checkForUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  openUpdateInstaller: vi.fn(),
  setWorkOffline: vi.fn(),
}));

import * as api from "./api";
import { checkForUpdate, getUpdateState, installUpdate, resetUpdateState } from "./updates";
import { initWorkOffline } from "./workOffline";

const UPDATE: UpdateInfo = {
  version: "1.4.0",
  current_version: "1.3.0",
  notes: "New things",
  release_url: "https://github.com/l0g-lab/RadioOperationsConsole/releases/tag/v1.4.0",
  installer: { name: "Radio.Operations.Console_1.4.0_amd64.deb", size: 200 },
};

describe("updates", () => {
  beforeEach(() => {
    initWorkOffline(false);
    resetUpdateState();
    vi.mocked(api.checkForUpdate).mockReset();
    vi.mocked(api.downloadUpdate).mockReset();
    vi.mocked(api.openUpdateInstaller).mockReset();
  });

  it("never checks while working offline, and says so when asked by hand", async () => {
    initWorkOffline(true);
    await checkForUpdate();
    expect(api.checkForUpdate).not.toHaveBeenCalled();
    expect(getUpdateState()).toEqual({ kind: "idle" });

    await checkForUpdate(true);
    expect(api.checkForUpdate).not.toHaveBeenCalled();
    expect(getUpdateState()).toMatchObject({ kind: "error", message: expect.stringMatching(/working offline/) });
  });

  it("stays quiet when an automatic check fails, but explains a check by hand", async () => {
    vi.mocked(api.checkForUpdate).mockRejectedValue("no connection");
    await checkForUpdate();
    expect(getUpdateState()).toEqual({ kind: "idle" });
    await checkForUpdate(true);
    expect(getUpdateState()).toMatchObject({ kind: "error", message: "Couldn't check for updates: no connection" });

    vi.mocked(api.checkForUpdate).mockResolvedValue(null);
    await checkForUpdate(true);
    expect(getUpdateState()).toEqual({ kind: "current" });
  });

  it("downloads with progress, then opens the installer", async () => {
    vi.mocked(api.checkForUpdate).mockResolvedValue(UPDATE);
    await checkForUpdate();
    expect(getUpdateState()).toMatchObject({ kind: "available", update: { version: "1.4.0" } });

    let midway: unknown;
    vi.mocked(api.downloadUpdate).mockImplementation(async () => {
      onProgress?.({ payload: { received: 100, total: 200 } });
      midway = getUpdateState();
      return "/home/pat/Downloads/Radio.Operations.Console_1.4.0_amd64.deb";
    });
    vi.mocked(api.openUpdateInstaller).mockResolvedValue("in_software_installer");
    await installUpdate();

    expect(midway).toMatchObject({ kind: "downloading", percent: 50 });
    expect(getUpdateState()).toMatchObject({
      kind: "opened",
      how: "in_software_installer",
      path: "/home/pat/Downloads/Radio.Operations.Console_1.4.0_amd64.deb",
    });
    expect(onProgress).toBeNull();
  });

  it("keeps the update on offer, with the reason, when the download fails", async () => {
    vi.mocked(api.checkForUpdate).mockResolvedValue(UPDATE);
    await checkForUpdate();
    vi.mocked(api.downloadUpdate).mockRejectedValue("The download stalled. Try again.");
    await installUpdate();
    expect(api.openUpdateInstaller).not.toHaveBeenCalled();
    expect(getUpdateState()).toMatchObject({
      kind: "error",
      update: { version: "1.4.0" },
      message: expect.stringMatching(/stalled/),
    });
  });
});
