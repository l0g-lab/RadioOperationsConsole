import { useState } from "react";
import * as api from "../../api";
import type { Activity, Operator } from "../../types";
import { isLog } from "../../activityTypes";
import ActivityStatus from "./ActivityStatus";
import CloseOutDialog from "./CloseOutDialog";
import ReopenDialog from "./ReopenDialog";

/** The status badge and the one lifecycle action that applies right now. */
export default function ActivityStateControls({
  activity,
  operator,
  onChanged,
}: {
  activity: Activity;
  operator: Operator | null;
  onChanged: () => void;
}) {
  const [dialog, setDialog] = useState<"close" | "reopen" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    try {
      await api.startActivity(activity.id, operator?.id ?? null);
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  function finished() {
    setDialog(null);
    onChanged();
  }

  // A station log is never started or ended, so it has no lifecycle to
  // show — unless it was closed (e.g. as another type), which can be undone.
  if (isLog(activity.activity_type) && activity.state !== "closed") return null;

  return (
    <>
      <ActivityStatus state={activity.state} />
      {activity.state === "scheduled" && <button onClick={start}>Start net</button>}
      {activity.state === "active" && <button onClick={() => setDialog("close")}>End net</button>}
      {activity.state === "closed" && <button onClick={() => setDialog("reopen")}>Reopen…</button>}
      {error && <span className="weather-area-error">{error}</span>}
      {dialog === "close" && (
        <CloseOutDialog
          activity={activity}
          operator={operator}
          onClose={() => setDialog(null)}
          onDone={finished}
        />
      )}
      {dialog === "reopen" && (
        <ReopenDialog
          activity={activity}
          operatorId={operator?.id ?? null}
          onClose={() => setDialog(null)}
          onDone={finished}
        />
      )}
    </>
  );
}
