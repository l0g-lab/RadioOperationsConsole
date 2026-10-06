import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageItem } from "../../types";

vi.mock("../../api", () => ({
  storageUsage: vi.fn(),
  clearStorage: vi.fn(),
  tileCacheLocation: vi.fn(),
}));
vi.mock("../../offlineTileLayer", () => ({ tileCacheUsage: vi.fn(), clearTileCache: vi.fn() }));

import * as api from "../../api";
import { clearTileCache, tileCacheUsage } from "../../offlineTileLayer";
import StoragePanel from "./StoragePanel";
import { backupDue } from "./BackupPanel";

const PACKS = "/home/op/.local/share/org.radiooperationsconsole.desktop/datapacks";
const BACKUPS = "/home/op/.local/share/org.radiooperationsconsole.desktop/backups";
const TILES = "/home/op/.local/share/org.radiooperationsconsole.desktop/CacheStorage";

const ITEMS: StorageItem[] = [
  { id: "callsigns-amateur", files: 1, bytes: 120_000_000, location: PACKS },
  { id: "callsigns-gmrs", files: 0, bytes: 0, location: PACKS },
  { id: "road-data", files: 2, bytes: 400_000, location: PACKS },
  { id: "partial-downloads", files: 2, bytes: 30_000_000, location: PACKS },
  { id: "restore-copies", files: 1, bytes: 5_000_000, location: BACKUPS },
];

const row = (name: RegExp) => screen.getByRole("group", { name });

describe("StoragePanel (STORE-001–STORE-004)", () => {
  beforeEach(() => {
    vi.mocked(api.storageUsage).mockResolvedValue(ITEMS);
    vi.mocked(api.clearStorage).mockReset();
    vi.mocked(api.clearStorage).mockResolvedValue(
      ITEMS.map((i) => (i.id === "partial-downloads" ? { ...i, files: 0, bytes: 0 } : i))
    );
    vi.mocked(api.tileCacheLocation).mockResolvedValue(TILES);
    vi.mocked(tileCacheUsage).mockResolvedValue({ tiles: 812, bytes: 15_000_000 });
    vi.mocked(clearTileCache).mockReset();
    vi.mocked(clearTileCache).mockResolvedValue();
  });

  it("lists what's stored with its size, leaves out what isn't, and totals everything", async () => {
    render(<StoragePanel onCleared={() => {}} />);
    expect(await screen.findByText(/All offline data on this computer: 170 MB/)).toBeInTheDocument();
    expect(within(row(/Map tiles/)).getByText(/812 tiles · 15 MB/)).toBeInTheDocument();
    expect(within(row(/Amateur call-sign file/)).getByText(/120 MB/)).toBeInTheDocument();
    // Nothing stored: no row (map tiles excepted).
    expect(screen.queryByRole("group", { name: /GMRS call-sign file/ })).not.toBeInTheDocument();
    expect(within(row(/Unfinished downloads/)).getByText(/2 files · 30 MB/)).toBeInTheDocument();
  });

  it("shows only the rows asked for, still totaling everything", async () => {
    render(<StoragePanel onCleared={() => {}} only={["map-tiles", "restore-copies"]} />);
    expect(await screen.findByText(/All offline data on this computer: 170 MB/)).toBeInTheDocument();
    expect(screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["Map tiles", "Safety copies"]);
  });

  it("still lists map tiles when their folder can't be found", async () => {
    vi.mocked(api.tileCacheLocation).mockRejectedValue("no path");
    render(<StoragePanel onCleared={() => {}} />);
    expect(await within(row(/Map tiles/)).findByText(/812 tiles/)).toBeInTheDocument();
    expect(within(row(/Map tiles/)).getByText(/Saved as you view maps/)).not.toHaveAttribute("title");
  });

  it("asks first, saying what clearing means, then clears and reports back", async () => {
    const user = userEvent.setup();
    const onCleared = vi.fn();
    render(<StoragePanel onCleared={onCleared} />);
    await screen.findByText(/All offline data on this computer/);
    await user.click(within(row(/Unfinished downloads/)).getByRole("button", { name: /Clear/ }));
    expect(screen.getByText(/start over instead of resuming/)).toBeInTheDocument();
    expect(api.clearStorage).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Clear unfinished downloads" }));
    expect(api.clearStorage).toHaveBeenCalledWith("partial-downloads");
    // Cleared, so nothing's stored: its row goes.
    await waitFor(() => expect(screen.queryByRole("group", { name: /Unfinished downloads/ })).not.toBeInTheDocument());
    expect(onCleared).toHaveBeenCalled();
  });

  it("clears map tiles in the webview's cache", async () => {
    const user = userEvent.setup();
    render(<StoragePanel onCleared={() => {}} />);
    await screen.findByText(/All offline data on this computer/);
    await user.click(within(row(/Map tiles/)).getByRole("button", { name: /Clear/ }));
    expect(screen.getByText(/blank offline until/)).toBeInTheDocument();
    vi.mocked(tileCacheUsage).mockResolvedValue({ tiles: 0, bytes: 0 });
    await user.click(screen.getByRole("button", { name: "Clear map tiles" }));
    expect(clearTileCache).toHaveBeenCalled();
    expect(api.clearStorage).not.toHaveBeenCalled();
  });

  it("shows why clearing failed", async () => {
    vi.mocked(api.clearStorage).mockRejectedValue("A call-sign download is running.");
    const user = userEvent.setup();
    render(<StoragePanel onCleared={() => {}} />);
    await screen.findByText(/All offline data on this computer/);
    await user.click(within(row(/Amateur call-sign file/)).getByRole("button", { name: /Clear/ }));
    await user.click(screen.getByRole("button", { name: "Clear amateur call-sign file" }));
    expect(await screen.findByText("A call-sign download is running.")).toBeInTheDocument();
  });
});


describe("backupDue (SET-040)", () => {
  it("is due if never backed up, or not for over 30 days", () => {
    const now = new Date(2026, 9, 5);
    expect(backupDue(null, now)).toBe(true);
    expect(backupDue(new Date(2026, 8, 1).toISOString(), now)).toBe(true);
    expect(backupDue(new Date(2026, 9, 1).toISOString(), now)).toBe(false);
  });
});
