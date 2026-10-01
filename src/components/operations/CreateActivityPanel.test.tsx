import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api", () => ({
  createActivity: vi.fn(() => Promise.resolve("new")),
  saveActivityTemplate: vi.fn(),
  setActivityLocationCoords: vi.fn(() => Promise.resolve()),
}));

import * as api from "../../api";
import CreateActivityPanel from "./CreateActivityPanel";

function renderPanel() {
  return render(
    <CreateActivityPanel
      activities={[]}
      onActivitiesChanged={() => {}}
      onSelectActivity={() => {}}
      operators={[]}
      selectedOperatorId={null}
      templates={[]}
      onTemplatesChanged={() => {}}
      useTemplateRequest={null}
      onUseTemplateHandled={() => {}}
    />
  );
}

describe("CreateActivityPanel", () => {
  beforeEach(() => vi.mocked(api.createActivity).mockClear());

  it("asks a net for its date, but not a station log, which is saved undated", async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(screen.getByText(/Date \(YYYY-MM-DD\)/)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: /type/i }), "station_log");
    expect(screen.queryByText(/Date \(YYYY-MM-DD\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Time \(HH:MM/)).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Activity title"), "VHF Simplex{Enter}");
    expect(api.createActivity).toHaveBeenCalledWith("VHF Simplex", "station_log", null, null);
  });
});
