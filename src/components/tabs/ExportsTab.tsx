import { useState } from "react";
import type { Activity, Operator } from "../../types";
import { activityTypeLabel } from "../../activityTypes";
import ActivityStatus from "../lifecycle/ActivityStatus";
import ExportOptions from "../exports/ExportOptions";
import Ics214Dialog from "../exports/Ics214Dialog";
import { FileDown } from "lucide-react";

interface Props {
  activity: Activity | null;
  operator: Operator | null;
}

/**
 * One place for everything that leaves the application: the chosen activity's
 * records and forms, and ICS 214 activity logs. A 214 covers a period across
 * activities, so it's offered even with no activity chosen.
 */
export default function ExportsTab({ activity, operator }: Props) {
  const [show214, setShow214] = useState(false);
  const row214 = (
    <div className="export-row">
      <div className="export-row-info">
        <strong>ICS 214 — Activity Log</strong>
        <span className="settings-hint"> across all activities in a period</span>
        <div className="settings-hint">
          What you did over a period of operation — a whole SET, say. For Winlink Express, or
          printable.
        </div>
      </div>
      <div className="inline-form">
        <button onClick={() => setShow214(true)}>Open…</button>
      </div>
    </div>
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
          <ExportOptions activity={activity} operator={operator} ics214={row214} />
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
          <div className="export-list">
            <section className="export-section">
              <h4 className="export-section-title">ICS forms</h4>
              {row214}
            </section>
          </div>
        </>
      )}
      {show214 && <Ics214Dialog operator={operator} onClose={() => setShow214(false)} />}
    </div>
  );
}
