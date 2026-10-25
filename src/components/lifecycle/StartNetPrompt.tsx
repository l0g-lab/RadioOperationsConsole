import { useEffect, useRef, useState } from "react";
import * as api from "../../api";
import type { Activity } from "../../types";
import { TriangleAlert } from "lucide-react";

/** How long after it appears Start now waits before it takes a press. */
const ARM_MS = 500;

/**
 * Asked once the first check-in is saved to a net that hasn't been started
 * (LIFE-024), right above the entry form where the operator is looking, so a
 * forgotten Start is caught as the net begins rather than fixed in Edit
 * afterwards. Start now has focus, so Enter starts it; Not yet (or Escape)
 * leaves it for early check-ins, with the amber banner still there.
 * The Enter that saved the check-in, held or pressed twice, mustn't start
 * the net too: Start now ignores repeats and its first half second.
 */
export default function StartNetPrompt({
  activity,
  operatorId,
  onStarted,
  onDismiss,
}: {
  activity: Activity;
  operatorId: string | null;
  onStarted: () => void;
  onDismiss: () => void;
}) {
  const startRef = useRef<HTMLButtonElement>(null);
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

  return (
    <div
      className="not-started-banner start-net-prompt"
      role="alertdialog"
      aria-label="Start the net now?"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onDismiss();
        } else if (e.key === "Enter" && e.repeat) {
          e.preventDefault();
        }
      }}
    >
      <TriangleAlert className="not-started-icon" aria-hidden />
      <span className="start-net-prompt-text">
        <strong>Start the net now?</strong> It hasn't been started, so it has no start time yet.
        {error && <span className="weather-area-error"> {error}</span>}
      </span>
      <button ref={startRef} className="primary" onClick={start}>
        Start now
      </button>
      <button onClick={onDismiss}>Not yet: early check-in</button>
    </div>
  );
}
