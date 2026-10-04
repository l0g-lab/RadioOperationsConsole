import type { Activity, Operator } from "./types";

/**
 * The default operator: who new activities are run by unless another is
 * chosen, and who is named on things outside any activity (repeaters, places,
 * net listings, the ICS 214). Remembered on this computer; the first operator
 * when none was chosen or the chosen one was removed.
 */
const KEY = "roc-default-operator";

export function loadDefaultOperatorId(operators: Operator[]): string | null {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // Storage unavailable: fall back to the first operator.
  }
  return saved && operators.some((o) => o.id === saved) ? saved : (operators[0]?.id ?? null);
}

export function saveDefaultOperatorId(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Not remembered; it still applies until the app is closed.
  }
}

/** Who runs an activity: its own operator, or the default for one without. */
export function activityOperatorId(activity: Activity | null | undefined, defaultId: string | null): string | null {
  return activity?.operator_id || defaultId;
}
