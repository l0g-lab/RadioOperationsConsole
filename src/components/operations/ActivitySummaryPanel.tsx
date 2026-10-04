import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, ActivitySummary } from "../../types";
import { SummaryView } from "../exports/SummaryView";
import { summaryFacts } from "../../summaryFacts";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * The selected activity's summary, laid out like the end-of-net step
 * (EXPORT-017). Viewing or saving it as text is on the Exports tab.
 */
export default function ActivitySummaryPanel({ activity }: { activity: Activity }) {
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  // Folded to one line by default, so the page isn't mostly summary; the same
  // summary is in the End net window and on the Exports tab.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api
      .activitySummary(activity.id)
      .then(setSummary)
      .catch(() => setSummary(null));
    // The activity object changes whenever its state does, which is when the numbers matter most.
  }, [activity]);

  if (!summary) return null;
  return (
    <div className="location-subpanel">
      <button className="summary-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown className="summary-toggle-icon" /> : <ChevronRight className="summary-toggle-icon" />}
        <h4>Summary</h4>
        {!open && (
          <span className="settings-hint">
            {summaryFacts(activity.activity_type, summary)
              .map((f) => f.text)
              .join(" · ")}
          </span>
        )}
      </button>
      {open && <SummaryView activity={activity} summary={summary} notes={summary.conclusion.trim()} />}
    </div>
  );
}
