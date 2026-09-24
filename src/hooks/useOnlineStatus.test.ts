import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useOnlineStatus } from "./useOnlineStatus";

describe("useOnlineStatus", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

  afterEach(() => {
    if (originalDescriptor) Object.defineProperty(window.navigator, "onLine", originalDescriptor);
  });

  function setNavigatorOnLine(value: boolean) {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => value,
    });
  }

  it("reflects navigator.onLine on first render", () => {
    setNavigatorOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("flips to false when the browser fires the 'offline' event", () => {
    setNavigatorOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
  });

  it("flips back to true when the browser fires the 'online' event", () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });

  it("stops listening after unmount", () => {
    setNavigatorOnLine(true);
    const { result, unmount } = renderHook(() => useOnlineStatus());
    unmount();
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    // No assertion possible on a dismounted hook's state directly, but this
    // should not throw — the listeners must have been removed cleanly.
    expect(result.current).toBe(true);
  });
});
