import { useState } from "react";

export type SortOrder = "newest" | "oldest";

/**
 * Which way a list is sorted by time, remembered on this computer for that
 * kind of list (check-ins, spotter reports, relayed messages).
 */
export function useSortOrder(list: string, initial: SortOrder): [SortOrder, () => void] {
  const key = `roc-sort-${list}`;
  const [order, setOrder] = useState<SortOrder>(() => {
    try {
      const v = localStorage.getItem(key);
      return v === "newest" || v === "oldest" ? v : initial;
    } catch {
      return initial;
    }
  });
  const toggle = () =>
    setOrder((o) => {
      const next = o === "newest" ? "oldest" : "newest";
      try {
        localStorage.setItem(key, next);
      } catch {
        // Not remembered; the order still changes for now.
      }
      return next;
    });
  return [order, toggle];
}

/** The items in time order, newest or oldest first. */
export function sortByTime<T>(items: T[], time: (item: T) => string, order: SortOrder): T[] {
  const ms = (item: T) => {
    const t = new Date(time(item)).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  const sorted = items
    .map((item, i) => ({ item, i, t: ms(item) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.item);
  return order === "newest" ? sorted.reverse() : sorted;
}
