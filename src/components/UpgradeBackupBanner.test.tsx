import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({ upgradeBackup: vi.fn() }));

import * as api from "../api";
import UpgradeBackupBanner from "./UpgradeBackupBanner";

describe("UpgradeBackupBanner", () => {
  it("says where the pre-update copy was saved, until dismissed", async () => {
    vi.mocked(api.upgradeBackup).mockResolvedValue({
      path: "/data/backups/before-upgrade-20261002-090000.db",
      error: null,
    });
    const user = userEvent.setup();
    render(<UpgradeBackupBanner />);
    expect(
      await screen.findByText("/data/backups/before-upgrade-20261002-090000.db")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says so when the copy couldn't be saved", async () => {
    vi.mocked(api.upgradeBackup).mockResolvedValue({ path: null, error: "disk full" });
    render(<UpgradeBackupBanner />);
    expect(await screen.findByRole("status")).toHaveTextContent(/couldn't be saved \(disk full\)/);
  });

  it("shows nothing when there was no upgrade", async () => {
    vi.mocked(api.upgradeBackup).mockResolvedValue(null);
    render(<UpgradeBackupBanner />);
    await Promise.resolve();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
