import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({ setWorkOffline: vi.fn() }));

import { initWorkOffline } from "../workOffline";
import RadarPanel from "./RadarPanel";

describe("RadarPanel while working offline (UX-022)", () => {
  afterEach(() => act(() => initWorkOffline(false)));

  it("doesn't load the radar image", () => {
    act(() => initWorkOffline(true));
    render(<RadarPanel centerLat={28.5} centerLon={-81.4} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(/working offline/i)).toBeInTheDocument();
  });

  it("loads it when online", () => {
    render(<RadarPanel centerLat={28.5} centerLon={-81.4} />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      expect.stringContaining("radar.weather.gov")
    );
  });
});
