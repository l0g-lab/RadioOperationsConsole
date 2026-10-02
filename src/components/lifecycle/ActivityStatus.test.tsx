import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ActivityStatus, { stateLabel } from "./ActivityStatus";

describe("stateLabel", () => {
  it("treats an unrecognized state as open rather than throwing", () => {
    expect(stateLabel("something_else")).toBe("Open");
  });
});

describe("ActivityStatus", () => {
  it("renders the label as text, not just a color (UX-009)", () => {
    render(<ActivityStatus state="closed" />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

});
