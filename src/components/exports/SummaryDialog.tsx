import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, ActivitySummary } from "../../types";
import { activitySummaryToText } from "../../export";
import { ScrollText } from "lucide-react";
import { ActionMessage, SummaryView, useEscape, useSummaryTextActions } from "./SummaryView";

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

function SummaryWindow({
  activity,
  heading,
  onClose,
  children,
  text,
  failed,
}: {
  activity: Activity;
  heading: string;
  onClose: () => void;
  children: React.ReactNode;
  text: string | null;
  failed: boolean;
}) {
  useEscape(onClose);
  const { copy, save, message } = useSummaryTextActions(activity, text);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel lifecycle-modal summary-modal"
        role="dialog"
        aria-label={`${heading} — ${activity.title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>
            <ScrollText className="heading-icon" />
            {heading} — {activity.title}
          </h3>
          <button onClick={onClose}>Close</button>
        </div>
        {failed && <p className="weather-area-error">Couldn't load the summary.</p>}
        {!failed && !text && <p className="settings-hint">Loading…</p>}
        {text && children}
        <div className="inline-form">
          <button onClick={copy} disabled={!text} title="Copy the summary as plain text">
            Copy
          </button>
          <button onClick={save} disabled={!text} title="Save the summary as a text file">
            Save…
          </button>
          <ActionMessage message={message} />
        </div>
      </div>
    </div>
  );
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
    <SummaryWindow activity={activity} heading="Summary" onClose={onClose} text={text} failed={failed}>
      {summary && <SummaryView activity={activity} summary={summary} notes={notes} />}
    </SummaryWindow>
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
    <SummaryWindow activity={activity} heading="Summary text" onClose={onClose} text={text} failed={failed}>
      <pre className="summary-text">{text}</pre>
    </SummaryWindow>
  );
}
