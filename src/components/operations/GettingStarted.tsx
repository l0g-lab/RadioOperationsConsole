import { useEffect, useState } from "react";
import * as api from "../../api";
import type { SettingsSection } from "../tabs/SettingsTab";
import { CircleCheck, Circle, Lightbulb } from "lucide-react";

const DISMISSED_KEY = "roc-getting-started-dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * What a new install still needs, on the Operations tab: each step ticks
 * itself off from the app's real state, with a button that goes to where it's
 * done. Gone once the essentials are done, or when dismissed.
 */
export default function GettingStarted({
  hasOperators,
  hasActivities,
  onNewActivity,
  onOpenSettings,
  onOpenWeather,
}: {
  hasOperators: boolean;
  hasActivities: boolean;
  onNewActivity: () => void;
  onOpenSettings: (section: SettingsSection) => void;
  onOpenWeather: () => void;
}) {
  const [dismissed, setDismissed] = useState(wasDismissed);
  // null until known, so a finished setup doesn't flash the checklist.
  const [hasDirectory, setHasDirectory] = useState<boolean | null>(null);

  useEffect(() => {
    if (dismissed) return;
    Promise.all([
      api.callsignPackStatus("amateur").catch(() => null),
      api.callsignPackStatus("gmrs").catch(() => null),
    ]).then(([ham, gmrs]) => setHasDirectory(Boolean(ham?.installed || gmrs?.installed)));
  }, [dismissed]);

  if (dismissed || hasDirectory === null) return null;
  if (hasOperators && hasActivities && hasDirectory) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Not remembered; it's still hidden for now.
    }
    setDismissed(true);
  }

  const step = (done: boolean, text: string, action?: { label: string; onClick: () => void }, note?: string) => (
    <li className={done ? "getting-started-done" : undefined}>
      {done ? (
        <CircleCheck className="getting-started-icon" aria-label="Done" />
      ) : (
        <Circle className="getting-started-icon" aria-label="To do" />
      )}
      <span>
        {text}
        {note && !done && <span className="settings-hint"> — {note}</span>}
      </span>
      {action && !done && (
        <button className="link-button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </li>
  );

  return (
    <div className="panel tip-panel">
      <div className="panel-header-row">
        <h3>
          <Lightbulb className="heading-icon" />
          Getting started
        </h3>
        <button className="link-button" onClick={dismiss}>
          Dismiss
        </button>
      </div>
      <ul className="getting-started">
        {step(hasOperators, "Add yourself as an operator", undefined, "under Operators, on the right")}
        {step(
          hasDirectory,
          "Download the FCC call-sign directory",
          { label: "Download now", onClick: () => onOpenSettings("callsigns") },
          "so names and locations fill in from call signs, even offline"
        )}
        {step(hasActivities, "Create your first activity, such as a weekly net", {
          label: "+ New activity",
          onClick: onNewActivity,
        })}
      </ul>
      <p className="settings-hint getting-started-optional">
        Optional:{" "}
        <button className="link-button" onClick={() => onOpenSettings("qrz")}>
          QRZ.com login
        </button>{" "}
        ·{" "}
        <button className="link-button" onClick={onOpenWeather}>
          Weather area
        </button>{" "}
        ·{" "}
        <button className="link-button" onClick={() => onOpenSettings("roads")}>
          Update mile-marker road data
        </button>
      </p>
    </div>
  );
}
