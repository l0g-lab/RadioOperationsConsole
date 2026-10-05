import { bandOf } from "../bands";

/**
 * The band a frequency is in ("2m", "70cm", "GMRS"), colored by group
 * (NETL-026): which radio it needs, at a glance. With `keepSpace`, an
 * unknown band leaves an empty chip's width so columns still line up.
 */
export default function BandChip({ mhz, keepSpace = false }: { mhz: number | null | undefined; keepSpace?: boolean }) {
  const band = bandOf(mhz);
  if (!band) return keepSpace ? <span className="band-chip band-none" aria-hidden /> : null;
  return (
    <span className={`band-chip band-${band.group}`} title={`${band.label} band`}>
      {band.label}
    </span>
  );
}
