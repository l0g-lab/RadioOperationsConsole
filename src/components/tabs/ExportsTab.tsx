import type { Activity, Operator } from "../../types";
import { activityTypeLabel } from "../../activityTypes";
import ActivityStatus from "../lifecycle/ActivityStatus";
import ExportOptions from "../exports/ExportOptions";
import { FileDown } from "lucide-react";

interface Props {
  activity: Activity | null;
  operator: Operator | null;
}

/** One place for everything that leaves the application: records, forms, and the full package. */
export default function ExportsTab({ activity, operator }: Props) {
  if (!activity) {
    return (
      <div className="panel">
        <h3><FileDown className="heading-icon" />Exports</h3>
        <p className="checkin-empty-state">
          Choose an activity in the top bar to export its records and forms.
        </p>
      </div>
    );
  }
  return (
    <div className="panel">
      <h3>
        <FileDown className="heading-icon" />
        Exports — {activity.title} <ActivityStatus state={activity.state} />{" "}
        <span className="type-pill">{activityTypeLabel(activity.activity_type)}</span>
      </h3>
      <p className="settings-hint">
        For the activity chosen in the top bar. Each file is saved where you choose, and nothing
        here needs an internet connection. Exports work on a closed activity too.
      </p>
      <ExportOptions activity={activity} operator={operator} />
    </div>
  );
}
