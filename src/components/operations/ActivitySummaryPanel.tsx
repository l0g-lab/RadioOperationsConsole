import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, ActivitySummary } from "../../types";
import { activitySummaryToText } from "../../export";
import { ActionMessage, SummaryView, useSummaryTextActions } from "../exports/SummaryView";
import { SummaryTextDialog } from "../exports/SummaryDialog";

/**
 * The selected activity's summary, laid out like the end-of-net step, with
 * the text it saves as one click away (EXPORT-017).
 */
export default function ActivitySummaryPanel({ activity }: { activity: Activity }) {
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [showingText, setShowingText] = useState(false);

  useEffect(() => {
    api
      .activitySummary(activity.id)
      .then(setSummary)
      .catch(() => setSummary(null));
    // The activity object changes whenever its state does, which is when the numbers matter most.
  }, [activity]);

  const text = summary ? activitySummaryToText(activity, summary) : null;
  const { save, message } = useSummaryTextActions(activity, text);

  if (!summary) return null;
  return (
    <div className="location-subpanel">
      <div className="panel-header-row">
        <h4>Summary</h4>
        <span className="operator-row-actions">
          <button className="link-button" onClick={() => setShowingText(true)}>
            Show summary text
          </button>
          <button className="link-button" onClick={save}>
            Save summary (text)
          </button>
        </span>
      </div>
      <SummaryView activity={activity} summary={summary} notes={summary.conclusion.trim()} />
      <ActionMessage message={message} />
      {showingText && (
        <SummaryTextDialog activity={activity} onClose={() => setShowingText(false)} />
      )}
    </div>
  );
}
