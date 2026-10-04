import type { HistoryEvent } from "./types";

/**
 * When the activity last ended before being reopened, from its history; ""
 * if it never has (LIFE-008).
 */
export function previousEnd(history: HistoryEvent[]): string {
  const closes = history.filter((e) => e.entity_type === "activity" && e.action === "closed");
  const last = closes[closes.length - 1];
  if (!last) return "";
  try {
    const t = JSON.parse(last.data)?.utc_time;
    if (typeof t === "string" && t) return t;
  } catch {
    // Fall back to when it was recorded.
  }
  return last.created_at;
}

/**
 * The end time to suggest when ending a reopened activity: the later of its
 * earlier end and the last record made since, so a late check-in moves the
 * end but a correction days later doesn't (LIFE-008). "" when there was no
 * earlier end, meaning "now".
 */
export function suggestedEnd(previous: string, recordTimes: string[]): string {
  const ms = (s: string) => {
    const t = new Date(s).getTime();
    return Number.isNaN(t) ? null : t;
  };
  const start = ms(previous);
  if (start == null) return "";
  const latest = Math.max(start, ...recordTimes.map(ms).filter((t): t is number => t != null));
  return new Date(latest).toISOString();
}
