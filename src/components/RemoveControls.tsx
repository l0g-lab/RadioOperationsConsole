import type { ReactNode } from "react";

/** The "Remove this …? Reason / Confirm / Cancel" bar shown under a roster. */
export function RemoveConfirmBar({
  question,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  question: string;
  reason: string;
  onReasonChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="inline-form checkin-roster-actions confirm-row">
      <span>{question}</span>
      <input
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
      />
      <button onClick={onConfirm}>Confirm remove</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  );
}

/** The "Removed …" panel listing voided items, each with a Restore button. */
export function RemovedPanel<T extends { id: string }>({
  title,
  emptyText,
  items,
  renderItem,
  onRestore,
}: {
  title: string;
  emptyText: string;
  items: T[];
  renderItem: (item: T) => ReactNode;
  onRestore: (id: string) => void;
}) {
  return (
    <div className="checkin-voided-panel">
      <h4>{title}</h4>
      {items.length === 0 && <p className="checkin-empty-state">{emptyText}</p>}
      {items.map((item) => (
        <div key={item.id} className="checkin-row checkin-row-voided">
          {renderItem(item)}
          <button onClick={() => onRestore(item.id)}>Restore</button>
        </div>
      ))}
    </div>
  );
}
