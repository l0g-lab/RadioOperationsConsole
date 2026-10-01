import L from "leaflet";

/** Class put on the map's container while it fills the window. */
export const EXPANDED_CLASS = "map-expanded";

// Lucide "maximize-2" / "minimize-2", inlined because Leaflet controls are
// plain DOM, not React.
const SVG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const EXPAND_ICON = `<svg ${SVG_ATTRS}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
const SHRINK_ICON = `<svg ${SVG_ATTRS}><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

/**
 * A map button that expands the map to fill the app window, and back
 * (button again, or Escape). The same map is just resized, so zoom, pan
 * and markers all carry over. Uses a CSS overlay rather than the browser
 * Fullscreen API, which the desktop webviews don't support reliably.
 */
export function addExpandControl(map: L.Map): L.Control {
  const container = map.getContainer();
  let button: HTMLButtonElement;

  const render = () => {
    const expanded = container.classList.contains(EXPANDED_CLASS);
    // Icon plus a text label: icons alone aren't enough (UX-007).
    button.innerHTML = `${expanded ? SHRINK_ICON : EXPAND_ICON}<span>${expanded ? "Exit full view" : "Full view"}</span>`;
    button.title = expanded ? "Return the map to its normal size (Esc)" : "Expand the map to fill the window";
    button.setAttribute("aria-pressed", String(expanded));
  };

  const setExpanded = (expanded: boolean) => {
    container.classList.toggle(EXPANDED_CLASS, expanded);
    render();
    map.invalidateSize();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && container.classList.contains(EXPANDED_CLASS)) {
      // Only leave full view — don't also close a dialog the map sits in.
      e.stopPropagation();
      setExpanded(false);
    }
  };

  const Control = L.Control.extend({
    onAdd() {
      const wrap = L.DomUtil.create("div", "leaflet-bar map-expand-control");
      button = L.DomUtil.create("button", "map-expand-button", wrap);
      button.type = "button";
      render();
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.on(button, "click", () =>
        setExpanded(!container.classList.contains(EXPANDED_CLASS))
      );
      document.addEventListener("keydown", onKeyDown, true);
      return wrap;
    },
    onRemove() {
      document.removeEventListener("keydown", onKeyDown, true);
      container.classList.remove(EXPANDED_CLASS);
    },
  });

  return new Control({ position: "topright" }).addTo(map);
}
