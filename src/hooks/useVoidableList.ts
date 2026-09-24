import { useEffect, useRef, useState } from "react";

interface Options<T> {
  /** Changing this (e.g. switching activity) closes the removal UI and clears the removed list. */
  scopeKey: string;
  listVoided: () => Promise<T[]>;
  voidItem: (id: string, reason: string | null) => Promise<unknown>;
  restoreItem: (id: string) => Promise<unknown>;
  /** Called after anything is removed or restored, so the live list can reload. */
  onChanged: () => void;
  /** Called with the id of an item just removed (e.g. to clear its selection). */
  onRemoved?: (id: string) => void;
}

/**
 * The "remove with a reason / show removed / restore" flow shared by the
 * check-in and spotter-report rosters. Items are voided rather than deleted,
 * so this keeps the pending-removal state, the reason text, and the list of
 * removed items that can be brought back.
 */
export function useVoidableList<T>(opts: Options<T>) {
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const [voided, setVoided] = useState<T[]>([]);

  // Handlers read the latest options, so callers can pass inline closures.
  const latest = useRef(opts);
  latest.current = opts;

  useEffect(() => {
    setRemovingId(null);
    setShowRemoved(false);
    setVoided([]);
  }, [opts.scopeKey]);

  function refreshVoided() {
    return latest.current
      .listVoided()
      .then(setVoided)
      .catch(() => setVoided([]));
  }

  function startRemove(id: string) {
    setRemovingId(id);
    setReason("");
  }

  function cancelRemove() {
    setRemovingId(null);
  }

  async function confirmRemove() {
    if (!removingId) return;
    const id = removingId;
    await latest.current.voidItem(id, reason.trim() || null);
    latest.current.onRemoved?.(id);
    setRemovingId(null);
    latest.current.onChanged();
    if (showRemoved) await refreshVoided();
  }

  async function toggleShowRemoved() {
    const next = !showRemoved;
    setShowRemoved(next);
    if (next) await refreshVoided();
  }

  async function restore(id: string) {
    await latest.current.restoreItem(id);
    latest.current.onChanged();
    await refreshVoided();
  }

  return {
    removingId,
    reason,
    setReason,
    showRemoved,
    voided,
    startRemove,
    cancelRemove,
    confirmRemove,
    toggleShowRemoved,
    restore,
  };
}
