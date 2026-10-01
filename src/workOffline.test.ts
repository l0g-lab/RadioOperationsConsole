import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ setWorkOffline: vi.fn(() => Promise.resolve()) }));

import * as api from "./api";
import {
  initWorkOffline,
  isWorkingOffline,
  offlineMessage,
  setWorkOffline,
  subscribeWorkOffline,
} from "./workOffline";

describe("workOffline (UX-020, UX-024)", () => {
  beforeEach(() => {
    initWorkOffline(false);
    vi.mocked(api.setWorkOffline).mockClear();
  });

  it("starts from the saved choice", () => {
    initWorkOffline(true);
    expect(isWorkingOffline()).toBe(true);
  });

  it("saves a change in the backend and tells listeners", async () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeWorkOffline(() => seen.push(isWorkingOffline()));
    await setWorkOffline(true);
    expect(api.setWorkOffline).toHaveBeenCalledWith(true);
    expect(isWorkingOffline()).toBe(true);
    expect(seen).toEqual([true]);
    unsubscribe();
    await setWorkOffline(false);
    expect(seen).toEqual([true]);
  });

  it("keeps the old state when the backend refuses", async () => {
    vi.mocked(api.setWorkOffline).mockRejectedValueOnce("disk full");
    await expect(setWorkOffline(true)).rejects.toBe("disk full");
    expect(isWorkingOffline()).toBe(false);
  });
});

describe("offlineMessage", () => {
  it("says working offline when that's the reason, otherwise no connection", () => {
    initWorkOffline(false);
    expect(offlineMessage("No internet connection.")).toBe("No internet connection.");
    initWorkOffline(true);
    expect(offlineMessage("No internet connection.")).toMatch(/working offline/);
  });
});
