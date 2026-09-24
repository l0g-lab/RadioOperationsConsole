/**
 * Several records resolved from the same ZIP, grid square or pin land on
 * exactly the same coordinates. Left alone, their markers stack and only the
 * topmost is visible or clickable, so a station or report looks like it never
 * made it onto the map. This fans exact duplicates out into a small ring
 * around their shared point so each gets its own visible marker.
 */
export function spreadDuplicates<T>(
  items: T[],
  position: (item: T) => { lat: number; lon: number },
  radiusDeg = 0.006
): { item: T; lat: number; lon: number }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const { lat, lon } = position(item);
    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const out: { item: T; lat: number; lon: number }[] = [];
  for (const group of groups.values()) {
    group.forEach((item, i) => {
      const { lat, lon } = position(item);
      if (group.length === 1) {
        out.push({ item, lat, lon });
        return;
      }
      const angle = (2 * Math.PI * i) / group.length;
      out.push({
        item,
        lat: lat + radiusDeg * Math.sin(angle),
        lon: lon + radiusDeg * Math.cos(angle),
      });
    });
  }
  return out;
}
