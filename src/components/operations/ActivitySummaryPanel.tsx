import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, ActivitySummary } from "../../types";
import { activitySummaryToText, exportFilename, formatDuration, saveTextFile } from "../../export";
import { formatTimeLines } from "../../utils";
import ActivityStatus from "../lifecycle/ActivityStatus";
import { activityTypeLabel } from "../../activityTypes";
import { summaryFacts } from "../../summaryFacts";

function when(iso: string): string {
  const t = formatTimeLines(iso);
  return t.utc ? `${t.local.replace("Local: ", "")} (${t.utc.replace("UTC: ", "")})` : t.local;
}

/** Status, times and counts for the selected activity, plus its closing notes. */
export default function ActivitySummaryPanel({ activity }: { activity: Activity }) {
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setMessage(null);
    api
      .activitySummary(activity.id)
      .then(setSummary)
      .catch(() => setSummary(null));
    // The activity object changes whenever its state does, which is when the numbers matter most.
  }, [activity]);

  async function exportSummary() {
    if (!summary) return;
    try {
      const path = await saveTextFile(
        exportFilename(activity, "Summary", "txt"),
        activitySummaryToText(activity, summary)
      );
      if (path) setMessage(`Saved to ${path}`);
    } catch (e) {
      setMessage(`Couldn't save: ${e}`);
    }
  }

  if (!summary) return null;
  const end = summary.closed_at || new Date().toISOString();
  const duration = summary.opened_at ? formatDuration(summary.opened_at, end) : "";

  return (
    <div className="location-subpanel">
      <div className="panel-header-row">
        <h4>Summary</h4>
        <button className="link-button" onClick={exportSummary}>
          Save summary (text)
        </button>
      </div>
      <p className="settings-hint">
        <ActivityStatus state={summary.state} />{" "}
        {summary.opened_at ? `Started ${when(summary.opened_at)}` : "Not started yet"}
        {summary.closed_at && ` · Ended ${when(summary.closed_at)}`}
        {duration && ` · ${summary.closed_at ? "Lasted" : "Open for"} ${duration}`}
      </p>
      <p className="settings-hint">
        {activityTypeLabel(activity.activity_type)}:{" "}
        {summaryFacts(activity.activity_type, summary)
          .map((f) => [f.text, f.detail].filter(Boolean).join(" "))
          .join(" · ")}
      </p>
      {summary.conclusion && (
        <p className="report-notes-detail">
          <span className="report-notes-label">Conclusion:</span> {summary.conclusion}
        </p>
      )}
      {message && <p className="settings-hint">{message}</p>}
    </div>
  );
}
