import type { Activity, Operator } from "../../types";
import { activityTypeLabel } from "../../activityTypes";
import ActivityStatus from "../lifecycle/ActivityStatus";
import ExportOptions from "../exports/ExportOptions";
import { FileDown } from "lucide-react";

interface Props {
  activity: Activity | null;
  /** Who runs the activity: named on its forms. */
  operator: Operator | null;
  /** Goes to the Events tab, where activity logs (ICS 214) and whole-event forms are. */
  onOpenEvents: () => void;
}

/**
 * Everything that leaves the application for the chosen activity: its
 * records and forms. Activity logs (ICS 214), which cover an event, and the
 * event-wide ICS 309 are on the Events tab (EVT-040, EVT-041).
 */
export default function ExportsTab({ activity, operator, onOpenEvents }: Props) {
  const eventsNote = (
    <p className="settings-hint">
      Activity logs (ICS 214) and one ICS 309 for a whole event are on the{" "}
      <button className="link-button" onClick={onOpenEvents}>
        Events tab
      </button>
      .
    </p>
  );
  return (
    <div className="panel">
      {activity ? (
        <>
          <h3>
            <FileDown className="heading-icon" />
            Exports — {activity.title} <ActivityStatus state={activity.state} />{" "}
            <span className="type-pill">{activityTypeLabel(activity.activity_type)}</span>
          </h3>
          <p className="settings-hint">
            For the activity chosen in the top bar. Each file is saved where you choose, and nothing
            here needs an internet connection. Exports work on a closed activity too.
          </p>
          <ExportOptions activity={activity} operator={operator} icsFormsNote={eventsNote} />
        </>
      ) : (
        <>
          <h3>
            <FileDown className="heading-icon" />
            Exports
          </h3>
          <p className="checkin-empty-state">
            Choose an activity in the top bar to export its records and forms.
          </p>
          {eventsNote}
        </>
      )}
    </div>
  );
}
