/**
 * Map icons for spotter-report hazard types: a colored disc with a white
 * glyph, drawn as inline SVG so they render identically everywhere and
 * need no image files or network.
 */
export interface HazardIcon {
  color: string;
  /** Inner SVG shapes for a 24x24 viewBox, drawn in white. */
  glyph: string;
}

const STROKE =
  'fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const ICONS: Record<string, HazardIcon> = {
  Hail: {
    color: "#1e88c8",
    // cloud with falling ice stones
    glyph: `<path ${STROKE} d="M7 14a3.5 3.5 0 0 1 .6-6.9A5 5 0 0 1 17.3 8 3 3 0 0 1 17 14"/>
      <circle cx="8" cy="18" r="1.3" fill="#fff"/><circle cx="12" cy="20" r="1.3" fill="#fff"/><circle cx="16" cy="18" r="1.3" fill="#fff"/>`,
  },
  "Wind Damage": {
    color: "#e0851b",
    // three wind streaks with curls
    glyph: `<path ${STROKE} d="M3 9h10a2.5 2.5 0 1 0-2.5-2.5"/>
      <path ${STROKE} d="M3 13h15a2.5 2.5 0 1 1-2.5 2.5"/>
      <path ${STROKE} d="M3 17h7"/>`,
  },
  Flooding: {
    color: "#2b5fd9",
    // waves
    glyph: `<path ${STROKE} d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>
      <path ${STROKE} d="M3 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>
      <path ${STROKE} d="M3 19c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>`,
  },
  Tornado: {
    color: "#c0392b",
    // funnel
    glyph: `<path ${STROKE} d="M3 5h18"/><path ${STROKE} d="M5 9h14"/>
      <path ${STROKE} d="M8 13h8"/><path ${STROKE} d="M10 17h4"/><path ${STROKE} d="M12 20v1"/>`,
  },
  "Snow/Ice Accumulation": {
    color: "#5b9bc4",
    // snowflake
    glyph: `<path ${STROKE} d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>
      <path ${STROKE} d="M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>`,
  },
  Other: {
    color: "#7b2ff7",
    // exclamation mark
    glyph: `<path ${STROKE} d="M12 5v9"/><circle cx="12" cy="19" r="1.4" fill="#fff"/>`,
  },
};

export function hazardIcon(hazardType: string): HazardIcon {
  return ICONS[hazardType] ?? ICONS.Other;
}

/** Complete SVG markup for a disc of the given pixel size. */
export function hazardIconSvg(hazardType: string, size = 32): string {
  const { color, glyph } = hazardIcon(hazardType);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">` +
    `<circle cx="16" cy="16" r="15" fill="${color}" stroke="#fff" stroke-width="2"/>` +
    `<g transform="translate(4 4)">${glyph}</g></svg>`
  );
}
