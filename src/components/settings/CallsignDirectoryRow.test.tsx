import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallsignPackStatus } from "../../types";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock("../../api", () => ({
  callsignPackStatus: vi.fn(),
  updateCallsignPack: vi.fn(),
  removeCallsignPack: vi.fn(),
  cancelCallsignDownload: vi.fn(() => Promise.resolve()),
}));

import * as api from "../../api";
import CallsignDirectoryRow, { CALLSIGN_DIRECTORIES } from "./CallsignDirectoryRow";

const NOT_INSTALLED: CallsignPackStatus = {
  installed: false,
  record_count: 0,
  generated_at: "",
  source: "",
  size_bytes: 0,
  has_street_addresses: false,
};
const gmrs = CALLSIGN_DIRECTORIES.find((d) => d.service === "gmrs")!;

describe("CallsignDirectoryRow (CALLDIR-040)", () => {
  beforeEach(() => {
    vi.mocked(api.callsignPackStatus).mockResolvedValue(NOT_INSTALLED);
    vi.mocked(api.updateCallsignPack).mockResolvedValue({
      ...NOT_INSTALLED,
      installed: true,
      record_count: 458084,
      has_street_addresses: true,
    });
  });

  it("states the size up front and downloads with one click (CALLDIR-031)", async () => {
    const user = userEvent.setup();
    const onBusy = vi.fn();
    render(<CallsignDirectoryRow def={gmrs} otherBusy={false} onBusyChange={onBusy} />);
    expect(api.callsignPackStatus).toHaveBeenCalledWith("gmrs");
    expect(await screen.findByText(/About 55 MB/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(api.updateCallsignPack).toHaveBeenCalledWith("gmrs");
    expect(await screen.findByText(/458,084 call signs/)).toBeInTheDocument();
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
  });

  it("can cancel a running download (CALLDIR-037)", async () => {
    let finish: (e: unknown) => void = () => {};
    vi.mocked(api.updateCallsignPack).mockReturnValue(
      new Promise((_, reject) => {
        finish = reject;
      })
    );
    const user = userEvent.setup();
    render(<CallsignDirectoryRow def={gmrs} otherBusy={false} onBusyChange={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.cancelCallsignDownload).toHaveBeenCalled();

    finish("Cancelled — downloading again picks up where it left off.");
    expect(await screen.findByText(/picks up where it left off/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  });

  it("waits while the other directory is downloading (CALLDIR-035)", () => {
    render(<CallsignDirectoryRow def={gmrs} otherBusy={true} onBusyChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    expect(screen.getByText(/Waiting for the other call-sign download/)).toBeInTheDocument();
  });
});
