import { afterEach, describe, expect, it, vi } from "vitest";
import L from "leaflet";
import { EXPANDED_CLASS, EXPAND_EVENT, addExpandControl } from "./expandControl";

function setup() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const map = L.map(el).setView([25.76, -80.5], 10);
  const invalidate = vi.spyOn(map, "invalidateSize");
  addExpandControl(map);
  const button = el.querySelector<HTMLButtonElement>(".map-expand-button")!;
  return { el, map, button, invalidate };
}

/** Escape pressed while `target` (e.g. a dialog's input) has focus. */
const escape = (target: Element) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("map Full view button", () => {
  it("expands the map to fill the window and back", () => {
    const { el, button, invalidate } = setup();
    expect(button.textContent).toBe("Full view");
    expect(button.getAttribute("aria-pressed")).toBe("false");

    button.click();
    expect(el.classList.contains(EXPANDED_CLASS)).toBe(true);
    expect(button.textContent).toBe("Exit full view");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(invalidate).toHaveBeenCalledTimes(1);

    button.click();
    expect(el.classList.contains(EXPANDED_CLASS)).toBe(false);
    expect(button.textContent).toBe("Full view");
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("doesn't count as a click on the map, though its label changes as it's clicked", () => {
    const { map, button } = setup();
    const onMap = vi.fn();
    const changed = vi.fn();
    map.on("click", onMap);
    map.on(EXPAND_EVENT, (e) => changed((e as unknown as { expanded: boolean }).expanded));
    // Click the label inside the button, which is replaced while handling it.
    button.querySelector("span")!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }));
    button.querySelector("span")!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }));
    expect(onMap).not.toHaveBeenCalled();
    expect(changed.mock.calls).toEqual([[true], [false]]);
  });

  it("Escape leaves full view without reaching handlers behind the map", () => {
    const { el, button } = setup();
    const input = document.body.appendChild(document.createElement("input"));
    const behind = vi.fn();
    input.addEventListener("keydown", behind);

    button.click();
    escape(input);
    expect(el.classList.contains(EXPANDED_CLASS)).toBe(false);
    expect(behind).not.toHaveBeenCalled();

    // Not expanded: Escape is left alone for whatever else uses it.
    escape(input);
    expect(behind).toHaveBeenCalledTimes(1);
  });

  it("stops listening and un-expands when the map goes away", () => {
    const { el, map, button } = setup();
    button.click();
    const remove = vi.spyOn(document, "removeEventListener");
    map.remove();
    expect(el.classList.contains(EXPANDED_CLASS)).toBe(false);
    expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function), true);
  });
});
