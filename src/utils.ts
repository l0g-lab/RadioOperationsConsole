export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatLocalParts(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatUtcParts(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(
    d.getUTCHours()
  )}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

/** Today's local date as "YYYY-MM-DD". */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Now as a local "YYYY-MM-DDTHH:mm" value, the format a datetime-local input uses. */
export function nowLocalInputValue(): string {
  const d = new Date();
  return `${todayIso()}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function nowLocal(): string {
  return formatLocalParts(new Date());
}

export function nowUtc(): string {
  return `${formatUtcParts(new Date())} Z`;
}

/**
 * `Activity.scheduled_at` is a free-text field that historically held just a
 * date ("2026-09-19"). To tell same-titled or same-day activities apart, it
 * can now also carry a time ("2026-09-19 18:00") — these helpers split that
 * combined string apart for editing and back together for saving, without
 * requiring a schema change or breaking older date-only values.
 */
export function splitScheduledAt(scheduledAt: string): { date: string; time: string } {
  const trimmed = scheduledAt.trim();
  if (!trimmed) return { date: "", time: "" };
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (match) return { date: match[1], time: match[2] };
  return { date: trimmed, time: "" };
}

export function combineScheduledAt(date: string, time: string): string {
  const d = date.trim();
  const t = time.trim();
  if (!d) return "";
  return t ? `${d} ${t}` : d;
}

export interface TimeLines {
  local: string;
  utc: string;
}

/**
 * Mirrors the original egui app's format_time (unix seconds first, then
 * RFC3339, else the raw string) but returns local/UTC as separate lines
 * instead of one "Local: ... / UTC: ..." string.
 */
export function formatTimeLines(s: string): TimeLines {
  if (/^-?\d+$/.test(s.trim())) {
    const sec = parseInt(s, 10);
    if (!Number.isNaN(sec)) {
      const d = new Date(sec * 1000);
      if (!Number.isNaN(d.getTime())) {
        return { local: `Local: ${formatLocalParts(d)}`, utc: `UTC: ${formatUtcParts(d)}` };
      }
    }
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      local: `Local: ${formatLocalParts(parsed)}`,
      utc: `UTC: ${formatUtcParts(parsed)}`,
    };
  }
  return { local: s, utc: "" };
}

export type ContactTime = { kind: "blank" } | { kind: "ok"; iso: string } | { kind: "invalid" };

/**
 * A typed contact time, in this computer's time: "YYYY-MM-DD HH:MM", with
 * optional ":SS" (a "T" instead of the space is fine too), or just "HH:MM"
 * (or "HH:MM:SS") for today. Blank means
 * "not given"; anything else unreadable is "invalid", so a typo is caught
 * rather than silently logged as now. A plain text box, not a date picker:
 * the desktop webviews' native pickers don't reliably close.
 */
export function parseContactTime(text: string, today: Date = new Date()): ContactTime {
  const v = text.trim();
  if (!v) return { kind: "blank" };
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  let parts: number[] | null = m ? m.slice(1).map((x) => Number(x ?? 0)) : null;
  if (!parts) {
    m = v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      parts = [today.getFullYear(), today.getMonth() + 1, today.getDate(), +m[1], +m[2], +(m[3] ?? 0)];
    }
  }
  if (!parts) return { kind: "invalid" };
  const [y, mo, d, h, mi, sec] = parts;
  const date = new Date(y, mo - 1, d, h, mi, sec);
  // Reject roll-overs like 2026-02-30 or 25:00 rather than "correcting" them.
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d ||
    date.getHours() !== h ||
    date.getMinutes() !== mi ||
    date.getSeconds() !== sec
  ) {
    return { kind: "invalid" };
  }
  return { kind: "ok", iso: date.toISOString() };
}

/**
 * A timestamp (or a Date) as "YYYY-MM-DD HH:MM:SS" in this computer's time,
 * the form a contact time is typed in ("" if unreadable). Seconds are kept so
 * correcting a contact doesn't quietly round its time.
 */
export function formatContactTime(when: string | Date): string {
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) return "";
  return formatLocalParts(d);
}
