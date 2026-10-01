import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Operator } from "../../types";

vi.mock("../../api", () => ({
  listRetiredOperators: vi.fn(),
  operatorHasRecords: vi.fn(),
  deleteOperator: vi.fn(),
  retireOperator: vi.fn(),
  restoreOperator: vi.fn(),
}));

import * as api from "../../api";
import OperatorsPanel from "./OperatorsPanel";

const op = (id: string, display_name: string): Operator => ({
  id,
  display_name,
  call_sign: "",
  location_label: "",
  location_lat: null,
  location_lon: null,
});

function renderPanel(onChanged = vi.fn()) {
  render(
    <OperatorsPanel
      operators={[op("o1", "Typo Person"), op("o2", "Pat")]}
      selectedOperatorId="o2"
      onOperatorsChanged={onChanged}
      onSelectOperator={() => {}}
    />
  );
  return onChanged;
}

describe("OperatorsPanel removal (AUDIT-012, AUDIT-013)", () => {
  beforeEach(() => {
    vi.mocked(api.listRetiredOperators).mockResolvedValue([]);
    for (const f of [api.deleteOperator, api.retireOperator, api.restoreOperator]) {
      vi.mocked(f).mockReset();
      vi.mocked(f).mockResolvedValue(undefined);
    }
  });

  it("deletes an operator nothing names, after confirmation", async () => {
    vi.mocked(api.operatorHasRecords).mockResolvedValue(false);
    const user = userEvent.setup();
    const onChanged = renderPanel();
    await user.click(screen.getByRole("button", { name: "Remove Typo Person" }));
    expect(await screen.findByText(/haven't been recorded on anything/)).toBeInTheDocument();
    expect(api.deleteOperator).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(api.deleteOperator).toHaveBeenCalledWith("o1");
    expect(api.retireOperator).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it("offers only retiring for an operator with records", async () => {
    vi.mocked(api.operatorHasRecords).mockResolvedValue(true);
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Remove Typo Person" }));
    expect(await screen.findByText(/can't be deleted/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete permanently" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retire" }));
    expect(api.retireOperator).toHaveBeenCalledWith("o1", "o2");
    expect(api.deleteOperator).not.toHaveBeenCalled();
  });

  it("lists retired operators so they can be restored", async () => {
    vi.mocked(api.listRetiredOperators).mockResolvedValue([op("o9", "Old Timer")]);
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: /Show retired \(1\)/ }));
    expect(screen.getByText("Old Timer")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore Old Timer" }));
    expect(api.restoreOperator).toHaveBeenCalledWith("o9", "o2");
  });
});
