import { useEffect, useState } from "react";

/** The time now, updated every minute, so "on now", "due", and "today" stay right while a tab sits open. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
