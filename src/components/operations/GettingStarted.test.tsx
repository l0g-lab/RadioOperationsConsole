import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api", () => ({ callsignPackStatus: vi.fn() }));

import * as api from "../../api";
import GettingStarted from "./GettingStarted";
import type { CallsignPackStatus } from "../../types";

const pack = (installed: boolean) => ({ installed }) as CallsignPackStatus;

function renderSteps(hasOperators: boolean, hasActivities: boolean, onOpenSettings = vi.fn()) {
  return render(
    <GettingStarted
      hasOperators={hasOperators}
      hasActivities={hasActivities}
      onNewActivity={() => {}}
      onOpenSettings={onOpenSettings}
      onOpenWeather={() => {}}
    />
  );
}

describe("GettingStarted", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.callsignPackStatus).mockResolvedValue(pack(false));
  });

  it("lists what's left, and goes to the FCC directory download", async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    renderSteps(true, false, open);
    expect(await screen.findByText("Download the FCC call-sign directory")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Done")).toHaveLength(1); // the operator
    await user.click(screen.getByRole("button", { name: "Download now" }));
    expect(open).toHaveBeenCalledWith("callsigns");
  });

  it("is gone once the essentials are done", async () => {
    vi.mocked(api.callsignPackStatus).mockResolvedValue(pack(true));
    const { container } = renderSteps(true, true);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("stays gone once dismissed", async () => {
    const user = userEvent.setup();
    const first = renderSteps(false, false);
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Getting started")).not.toBeInTheDocument();
    first.unmount();
    renderSteps(false, false);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("Getting started")).not.toBeInTheDocument();
  });
});
