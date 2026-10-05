import { useEffect, useRef } from "react";
import type { Activity, Operator } from "../../types";
import ExportOptions from "../exports/ExportOptions";
import { FileDown } from "lucide-react";

/**
 * The selected activity's exports and forms, under it on the Operations tab
 * (EXPORT-001): its records as CSV or text, the net summary, and the ICS 213
 * and 309. An event's forms are on its page on the Events tab.
 */
export default function ActivityExportsPanel({
  activity,
  operator,
  onOpenEvents,
  scrollRequested = false,
  onScrollHandled,
}: {
  activity: Activity;
  /** Who runs the activity: named on its forms. */
  operator: Operator | null;
  onOpenEvents: () => void;
  /** Bring the panel into view, e.g. from the Check-ins tab's Exports link. */
  scrollRequested?: boolean;
  onScrollHandled?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollRequested) return;
    onScrollHandled?.();
    requestAnimationFrame(() => ref.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRequested]);

  return (
    <div className="panel" ref={ref} id="activity-exports">
      <h3>
        <FileDown className="heading-icon" />
        Exports &amp; forms — {activity.title}
      </h3>
      <p className="settings-hint">
        Each file is saved where you choose, and nothing here needs an internet connection. Exports
        work on a closed activity too.
      </p>
      <ExportOptions
        activity={activity}
        operator={operator}
        icsFormsNote={
          <p className="settings-hint">
            {activity.event
              ? `An ICS 214 activity log and one ICS 309 for all of ${activity.event} are on its page on the `
              : "Activity logs (ICS 214) and one ICS 309 for a whole event are on the "}
            <button className="link-button" onClick={onOpenEvents}>
              Events tab
            </button>
            .
          </p>
        }
      />
    </div>
  );
}
