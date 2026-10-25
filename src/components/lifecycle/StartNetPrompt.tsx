import { useEffect, useRef, useState } from "react";
import * as api from "../../api";
import type { Activity } from "../../types";
import { isLog } from "../../activityTypes";
import { scheduledDate } from "../../activityList";
import { splitScheduledAt } from "../../utils";
import { TriangleAlert } from "lucide-react";

/** How long after it appears Start now waits before it takes a press. */
const ARM_MS = 500;
/** Without a scheduled time still to come, how long after a Not yet it asks again. */
const ASK_AGAIN_MS = 10 * 60_000;

/** When each net was last answered Not yet, while the app is open (kept across tabs). */
const notYetAt = new Map<string, number>();

export function recordNotYet(activityId: string, now = Date.now()) {
  notYetAt.set(activityId, now);
}

/** Forgets every Not yet (for tests). */
export function clearNotYet() {
  notYetAt.clear();
}

/**
 * Whether a check-in just saved to this activity should ask to start the net
 * (LIFE-024): a net not started, never answered Not yet; or answered before
 * its scheduled time, now come; or otherwise answered 10 minutes ago. So
 * early check-ins aren't asked each time, but the net beginning is.
 */
export function shouldAskToStart(activity: Activity, now = Date.now()): boolean {
  if (activity.state !== "scheduled" || isLog(activity.activity_type)) return false;
  const last = notYetAt.get(activity.id);
  if (last == null) return true;
  const due = splitScheduledAt(activity.scheduled_at).time ? scheduledDate(activity)?.getTime() : undefined;
  if (due != null && last < due) return now >= due;
  return now - last >= ASK_AGAIN_MS;
}

/**
 * "Start the net now?", over everything until it's answered (LIFE-024), as a
 * check-in is saved to a net that hasn't been started, so a forgotten Start
 * is caught as the net begins rather than fixed in Edit afterwards. Start now
 * has focus, so Enter starts it; Not yet (or Escape) leaves it for early
 * check-ins, with the amber banner still there. The Enter that saved the
 * check-in, held or pressed twice, mustn't start the net too: Start now
 * ignores repeats and its first half second.
 */
export default function StartNetPrompt({
  activity,
  operatorId,
  onStarted,
  onNotYet,
}: {
  activity: Activity;
  operatorId: string | null;
  onStarted: () => void;
  onNotYet: () => void;
}) {
  const startRef = useRef<HTMLButtonElement>(null);
  const laterRef = useRef<HTMLButtonElement>(null);
  const shownAt = useRef(Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startRef.current?.focus();
  }, []);

  async function start() {
    if (Date.now() - shownAt.current < ARM_MS) return;
    setError(null);
    try {
      await api.startActivity(activity.id, operatorId);
      onStarted();
    } catch (e) {
      setError(String(e));
    }
  }

  function notYet() {
    recordNotYet(activity.id);
    onNotYet();
  }

  return (
    <div className="modal-overlay">
      <div
        className="modal-panel lifecycle-modal start-net-prompt"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="start-net-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            notYet();
          } else if (e.key === "Enter" && e.repeat) {
            e.preventDefault();
          } else if (e.key === "Tab") {
            // Kept on its two buttons until it's answered.
            e.preventDefault();
            (document.activeElement === startRef.current ? laterRef : startRef).current?.focus();
          }
        }}
      >
        <h3 id="start-net-title">
          <TriangleAlert className="heading-icon heading-icon-warning" aria-hidden />
          Start the net now?
        </h3>
        <p>
          <strong>{activity.title}</strong> hasn't been started, so it has no start time yet. The check-in is saved
          either way.
        </p>
        {error && <p className="weather-area-error">{error}</p>}
        <div className="start-net-prompt-actions">
          <button ref={startRef} className="primary" onClick={start}>
            Start now
          </button>
          <button ref={laterRef} onClick={notYet}>
            Not yet: early check-in
          </button>
        </div>
      </div>
    </div>
  );
}
