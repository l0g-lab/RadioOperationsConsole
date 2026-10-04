import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import type { SortOrder } from "../hooks/useSortOrder";

/** Flips a list between newest first and oldest first; says which it is now. */
export default function SortToggle({ order, onToggle }: { order: SortOrder; onToggle: () => void }) {
  const Icon = order === "newest" ? ArrowDownWideNarrow : ArrowUpNarrowWide;
  return (
    <button
      className="sort-toggle"
      onClick={onToggle}
      title={order === "newest" ? "Showing newest first. Click for oldest first." : "Showing oldest first. Click for newest first."}
    >
      <Icon className="sort-toggle-icon" aria-hidden="true" />
      {order === "newest" ? "Newest first" : "Oldest first"}
    </button>
  );
}
