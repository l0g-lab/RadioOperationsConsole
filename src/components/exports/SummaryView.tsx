import { useEffect } from "react";
import type { Activity, ActivitySummary } from "../../types";
import { formatDuration } from "../../export";
import { summaryFacts } from "../../summaryFacts";
import { activityTypeLabel } from "../../activityTypes";
import { formatTimeLines } from "../../utils";
import ActivityStatus from "../lifecycle/ActivityStatus";

/** "2026-09-29 19:00 (23:00Z)": local time, with UTC alongside. */
function when(iso: string): string {
  const t = formatTimeLines(iso);
  return t.utc ? `${t.local.replace("Local: ", "")} (${t.utc.replace("UTC: ", "")})` : t.local;
}

/**
 * An activity's summary, laid out like the end-of-net step: what it was, the
 * counts its type emphasises, when it ran, anything left open, and the
 * closing notes. Shown on the Operations tab and in the archived-activity
 * window.
 */
export function SummaryView({
  activity,
  summary,
  notes,
}: {
  activity: Activity;
  summary: ActivitySummary;
  /** The closing notes to show (saved, or still being written). */
  notes: string;
}) {
  const ended = summary.closed_at || "";
  const duration = summary.opened_at
    ? formatDuration(summary.opened_at, ended || new Date().toISOString())
    : "";
  const about = [
    activityTypeLabel(activity.activity_type),
    activity.scheduled_at,
    activity.frequency,
    activity.repeater_name && `Repeater ${activity.repeater_name}`,
  ].filter(Boolean);

  return (
    <div className="summary-view">
      <p className="settings-hint summary-about">
        <ActivityStatus state={summary.state} /> {about.join(" · ")}
      </p>

      <div className="summary-grid">
        {summaryFacts(activity.activity_type, summary).map((f) => (
          <div key={f.key}>
            {f.text}
            {f.detail && <span className="settings-hint"> {f.detail}</span>}
          </div>
        ))}
        {duration && (
          <div>
            {ended ? "Lasted" : "Open for"} <strong>{duration}</strong>
          </div>
        )}
      </div>

      <div className="summary-times">
        <div>
          <span className="report-notes-label">Started</span>{" "}
          {summary.opened_at ? when(summary.opened_at) : "Not started"}
        </div>
        {ended && (
          <div>
            <span className="report-notes-label">Ended</span> {when(ended)}
          </div>
        )}
      </div>

      {summary.open_traffic_items > 0 && (
        <p className="closeout-warning" role="alert">
          {summary.open_traffic_items} check-in
          {summary.open_traffic_items === 1
            ? " has traffic that wasn't"
            : "s have traffic that weren't"}{" "}
          marked handled.
        </p>
      )}

      {summary.held_relay_messages > 0 && (
        <p className="closeout-warning" role="alert">
          {summary.held_relay_messages === 1
            ? "1 relay message was never passed on"
            : `${summary.held_relay_messages} relay messages were never passed on`}{" "}
          or marked as not passed.
        </p>
      )}

      <div className="summary-conclusion">
        <span className="report-notes-label">Conclusion / notes</span>
        <p>{notes || <em className="settings-hint">None recorded.</em>}</p>
      </div>
    </div>
  );
}

/** The outcome of a Copy or Save. */
export function ActionMessage({ message }: { message: { text: string; error: boolean } | null }) {
  if (!message) return null;
  return (
    <span className={message.error ? "weather-area-error" : "settings-hint"} role="status">
      {message.text}
    </span>
  );
}

/** Closes a window on Escape. */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}
