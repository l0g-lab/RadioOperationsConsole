import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import InfoToggle from "./InfoToggle";

describe("InfoToggle", () => {
  it("starts closed, with the explanation not in the document", () => {
    render(<InfoToggle label="QRZ lookup">The explanation text.</InfoToggle>);
    expect(screen.queryByText("The explanation text.")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("opens and closes on click, toggling the accessible label", async () => {
    const user = userEvent.setup();
    render(<InfoToggle label="QRZ lookup">The explanation text.</InfoToggle>);
    const button = screen.getByRole("button", { name: "Show information about QRZ lookup" });

    await user.click(button);
    expect(screen.getByText("The explanation text.")).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Hide information about QRZ lookup" })).toBe(button);

    await user.click(button);
    expect(screen.queryByText("The explanation text.")).not.toBeInTheDocument();
  });
});
