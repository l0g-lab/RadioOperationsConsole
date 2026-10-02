import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, ActivitySummary } from "../../types";
import { activitySummaryToText, exportFilename } from "../../export";
import { SummaryView } from "./SummaryView";
import { PreviewWindow } from "./PreviewWindow";

/** An activity's summary, loaded by id; with closing notes still being written in place of saved ones. */
function useSummary(activity: Activity, conclusion?: string) {
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api
      .activitySummary(activity.id)
      .then(setSummary)
      .catch(() => setFailed(true));
  }, [activity.id]);
  const notes = summary ? (conclusion ?? summary.conclusion).trim() : "";
  const text = summary ? activitySummaryToText(activity, { ...summary, conclusion: notes }) : null;
  return { summary, failed, notes, text };
}

/**
 * An activity's summary in a window, laid out like the end-of-net step. Used
 * for archived activities, so they can be read without restoring them.
 */
export default function SummaryDialog({
  activity,
  conclusion,
  onClose,
}: {
  activity: Activity;
  /** Closing notes being written in the end-of-net step, shown before they're saved. */
  conclusion?: string;
  onClose: () => void;
}) {
  const { summary, failed, notes, text } = useSummary(activity, conclusion);
  return (
    <PreviewWindow
      heading={`Summary — ${activity.title}`}
      filename={exportFilename(activity, "Summary", "txt")}
      text={text}
      what="the summary"
      failed={failed}
      onClose={onClose}
    >
      {summary && <SummaryView activity={activity} summary={summary} notes={notes} />}
    </PreviewWindow>
  );
}

/**
 * Exactly the text the summary is saved as (the "Net summary → Text"
 * export), shown before saving it, with Copy and Save (EXPORT-017).
 */
export function SummaryTextDialog({
  activity,
  conclusion,
  onClose,
}: {
  activity: Activity;
  conclusion?: string;
  onClose: () => void;
}) {
  const { failed, text } = useSummary(activity, conclusion);
  return (
    <PreviewWindow
      heading={`Summary text — ${activity.title}`}
      filename={exportFilename(activity, "Summary", "txt")}
      text={text}
      what="the summary"
      failed={failed}
      onClose={onClose}
    >
      <pre className="summary-text">{text}</pre>
    </PreviewWindow>
  );
}
