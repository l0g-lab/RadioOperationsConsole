import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({ setWorkOffline: vi.fn(() => Promise.resolve()) }));
vi.mock("../hooks/useOnlineStatus", () => ({ useOnlineStatus: vi.fn(() => true) }));

import * as api from "../api";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { initWorkOffline } from "../workOffline";
import OnlineStatusToggle from "./OnlineStatusToggle";

describe("OnlineStatusToggle (UX-020, UX-021)", () => {
  beforeEach(() => {
    act(() => initWorkOffline(false));
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    vi.mocked(api.setWorkOffline).mockClear();
  });

  it("reads Online and says clicking works offline", () => {
    render(<OnlineStatusToggle />);
    const pill = screen.getByRole("button", { name: /Online.*click to work offline/i });
    expect(pill).toHaveTextContent("Online");
    expect(pill).toHaveAttribute("aria-pressed", "false");
    expect(pill).toHaveClass("online-pill", "online-pill-online");
  });

  it("switches to working offline and back", async () => {
    const user = userEvent.setup();
    render(<OnlineStatusToggle />);
    await user.click(screen.getByRole("button"));
    expect(api.setWorkOffline).toHaveBeenLastCalledWith(true);
    const pill = screen.getByRole("button", { name: /Working offline.*click to go back online/i });
    expect(pill).toHaveTextContent("Working offline");
    expect(pill).toHaveAttribute("aria-pressed", "true");

    await user.click(pill);
    expect(api.setWorkOffline).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button")).toHaveTextContent("Online");
  });

  it("works from the keyboard", async () => {
    const user = userEvent.setup();
    render(<OnlineStatusToggle />);
    screen.getByRole("button").focus();
    await user.keyboard("{Enter}");
    expect(api.setWorkOffline).toHaveBeenLastCalledWith(true);
  });

  it("tells no connection apart from working offline", () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    render(<OnlineStatusToggle />);
    expect(screen.getByRole("button")).toHaveTextContent(/^Offline$/);
  });
});
