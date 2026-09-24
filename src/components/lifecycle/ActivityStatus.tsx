/** How an activity's lifecycle state reads to the operator. */
export function stateLabel(state: string): string {
  if (state === "scheduled") return "Not started";
  if (state === "closed") return "Closed";
  return "Open";
}

/** A small badge — text as well as color, so the state never rests on color alone. */
export default function ActivityStatus({ state }: { state: string }) {
  return (
    <span className={`state-pill state-pill-${state}`} title="Activity status">
      {stateLabel(state)}
    </span>
  );
}
