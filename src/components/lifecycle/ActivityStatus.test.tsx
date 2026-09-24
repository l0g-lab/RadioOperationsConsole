import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ActivityStatus, { stateLabel } from "./ActivityStatus";

describe("stateLabel", () => {
  it("maps each known state to its operator-facing word", () => {
    expect(stateLabel("scheduled")).toBe("Not started");
    expect(stateLabel("active")).toBe("Open");
    expect(stateLabel("closed")).toBe("Closed");
  });

  it("treats an unrecognized state as open rather than throwing", () => {
    expect(stateLabel("something_else")).toBe("Open");
  });
});

describe("ActivityStatus", () => {
  it("renders the label as text, not just a color (UX-009)", () => {
    render(<ActivityStatus state="closed" />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("gives each state a distinct class name for styling", () => {
    const { rerender, container } = render(<ActivityStatus state="active" />);
    expect(container.querySelector(".state-pill-active")).not.toBeNull();
    rerender(<ActivityStatus state="closed" />);
    expect(container.querySelector(".state-pill-closed")).not.toBeNull();
  });
});
