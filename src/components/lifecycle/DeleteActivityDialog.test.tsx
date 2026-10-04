import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "../../types";

vi.mock("../../api", () => ({ activityDeletePreview: vi.fn(), deleteActivity: vi.fn() }));

import * as api from "../../api";
import DeleteActivityDialog from "./DeleteActivityDialog";

const activity: Activity = {
  id: "a1",
  title: "Tuesday Net",
  activity_type: "directed_net",
  scheduled_at: "",
  frequency: "",
  location_label: "",
  location_lat: null,
  location_lon: null,
  state: "active",
  opened_at: "",
  closed_at: "",
  conclusion: "",
  repeater_name: "",
  repeater_lat: null,
  repeater_lon: null,
  operator_id: "",
};

function renderDialog(onDeleted = vi.fn()) {
  render(
    <DeleteActivityDialog
      activity={activity}
      operatorId="op1"
      onClose={() => {}}
      onDeleted={onDeleted}
    />
  );
  return onDeleted;
}

describe("DeleteActivityDialog (AUDIT-007, AUDIT-008)", () => {
  beforeEach(() => {
    vi.mocked(api.activityDeletePreview).mockResolvedValue({ checkins: 12, spotter_reports: 3 });
    vi.mocked(api.deleteActivity).mockReset();
    vi.mocked(api.deleteActivity).mockResolvedValue({ checkins: 12, spotter_reports: 3 });
  });

  it("says exactly what will be erased, that it can't be undone, and that backups are kept", async () => {
    renderDialog();
    expect(await screen.findByText(/12 check-ins and 3 spotter reports/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByText(/backups and exported files/i)).toBeInTheDocument();
    expect(screen.getByText(/Exports tab/)).toBeInTheDocument();
  });

  it("stays locked until the title is typed, then deletes", async () => {
    const user = userEvent.setup();
    const onDeleted = renderDialog();
    const button = await screen.findByRole("button", { name: "Delete permanently" });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText(/Type the activity's title/), "Tuesday");
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/Type the activity's title/), " net");
    expect(button).toBeEnabled();

    await user.click(button);
    expect(api.deleteActivity).toHaveBeenCalledWith("a1", "op1");
    expect(onDeleted).toHaveBeenCalled();
  });

  it("shows why a delete failed and stays open", async () => {
    vi.mocked(api.deleteActivity).mockRejectedValue("That activity no longer exists.");
    const user = userEvent.setup();
    const onDeleted = renderDialog();
    await user.type(await screen.findByLabelText(/Type the activity's title/), "Tuesday Net");
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(await screen.findByText("That activity no longer exists.")).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
