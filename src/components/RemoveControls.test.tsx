import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RemoveConfirmBar, RemovedPanel } from "./RemoveControls";

describe("RemoveConfirmBar", () => {
  it("shows the question and reason text, and calls back on confirm/cancel", async () => {
    const user = userEvent.setup();
    const onReasonChange = vi.fn();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <RemoveConfirmBar
        question="Remove this check-in?"
        reason="duplicate"
        onReasonChange={onReasonChange}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText("Remove this check-in?")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Reason (optional)")).toHaveValue("duplicate");

    await user.click(screen.getByRole("button", { name: "Confirm remove" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.type(screen.getByPlaceholderText("Reason (optional)"), "!");
    expect(onReasonChange).toHaveBeenCalled();
  });
});

describe("RemovedPanel", () => {
  it("renders each item and restores it on click", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    render(
      <RemovedPanel
        title="Removed check-ins"
        emptyText="No removed check-ins."
        items={[{ id: "c1", call: "K4ABC" }]}
        renderItem={(item) => <span>{item.call}</span>}
        onRestore={onRestore}
      />
    );
    expect(screen.getByText("K4ABC")).toBeInTheDocument();
    expect(screen.queryByText("No removed check-ins.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(onRestore).toHaveBeenCalledWith("c1");
  });
});
