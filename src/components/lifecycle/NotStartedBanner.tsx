import { useEffect, useState } from "react";
import type { Activity } from "../../types";
import { isLog, isRelay } from "../../activityTypes";
import { splitScheduledAt } from "../../utils";
import { TriangleAlert } from "lucide-react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * When a not-yet-started net was due, for the banner: "scheduled for 19:00,
 * 5 min ago", "scheduled for 19:00, in 10 min", "scheduled for Tue 10/6
 * 19:00"; "" with no scheduled time.
 */
export function scheduledHint(scheduledAt: string, now = new Date()): string {
  const { date, time } = splitScheduledAt(scheduledAt);
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || !time) return "";
  const [h, min] = time.split(":").map(Number);
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, min);
  const mins = Math.round((now.getTime() - due.getTime()) / 60000);
  if (due.toDateString() !== now.toDateString()) {
    return `scheduled for ${WEEKDAYS[due.getDay()]} ${due.getMonth() + 1}/${due.getDate()} ${time}`;
  }
  if (mins >= 1) return `scheduled for ${time}, ${mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`} ago`;
  if (mins > -60) return `scheduled for ${time}, in ${-mins || 1} min`;
  return `scheduled for ${time}`;
}

/**
 * Where records are logged to a net that hasn't been started: says so, in
 * amber, and points to Start in the top bar — the one place a net is started
 * and ended (LIFE-023), as the closed banner points to Reopen. Records can
 * still be logged (some nets take early check-ins).
 */
export default function NotStartedBanner({ activity }: { activity: Activity }) {
  const [now, setNow] = useState(() => new Date());

  // Keeps "5 min ago" current.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (activity.state !== "scheduled" || isLog(activity.activity_type)) return null;
  const noun = isRelay(activity.activity_type) ? "relay" : "net";
  const hint = scheduledHint(activity.scheduled_at, now);

  return (
    <p className="not-started-banner" role="status">
      <TriangleAlert className="not-started-icon" aria-hidden />
      <span>
        <strong>
          This {noun} hasn't started{hint && ` — ${hint}`}.
        </strong>{" "}
        Use <strong>Start {noun}</strong> in the top bar when it begins.
      </span>
    </p>
  );
}
