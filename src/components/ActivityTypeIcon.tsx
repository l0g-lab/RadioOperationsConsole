import { CircleDot, MessagesSquare, NotebookPen, Radio, Send, Signal, Tornado, type LucideIcon } from "lucide-react";
import { activityTypeLabel } from "../activityTypes";

/** An icon per activity type, so a SKYWARN net or a relay stands out in a list (NETL-026). */
const ICONS: Record<string, LucideIcon> = {
  simple_net: MessagesSquare,
  directed_net: Radio,
  skywarn: Tornado,
  station_log: NotebookPen,
  range_check: Signal,
  relay: Send,
};

export default function ActivityTypeIcon({ type, className = "" }: { type: string; className?: string }) {
  const Icon = ICONS[type] ?? CircleDot;
  const label = activityTypeLabel(type);
  return (
    <span className={`activity-type-icon activity-type-${type} ${className}`.trim()} title={label}>
      <Icon role="img" aria-label={label} />
    </span>
  );
}
