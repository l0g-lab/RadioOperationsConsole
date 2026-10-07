import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import * as api from "../api";
import type { ListKind } from "../api";
import type { ImportSummary } from "../types";
import { isoDate } from "../netSchedule";

const WORDS: Record<ListKind, { title: string; list: string; one: string; many: string }> = {
  repeaters: { title: "Repeaters", list: "repeater list", one: "repeater", many: "repeaters" },
  nets: { title: "Nets", list: "net list", one: "net", many: "nets" },
};

type Message = { kind: "ok" | "error"; text: string };

function count(n: number, w: (typeof WORDS)[ListKind]): string {
  return `${n} ${n === 1 ? w.one : w.many}`;
}

/** "Adds 3 nets. 2 already here are left as they are. 1 couldn't be read and is skipped." */
export function describeImport(kind: ListKind, s: ImportSummary, done = false): string {
  const w = WORDS[kind];
  const parts = [
    s.new === 0
      ? `Nothing new: ${s.total === 0 ? `the file has no ${w.many}` : `all ${count(s.total, w)} are already here`}.`
      : `${done ? "Added" : "Adds"} ${count(s.new, w)}.`,
  ];
  if (s.new > 0 && s.already_here > 0) {
    parts.push(`${s.already_here} already here ${s.already_here === 1 ? "is left as it is" : "are left as they are"}.`);
  }
  if (s.unreadable > 0) parts.push(`${s.unreadable} couldn't be read and ${s.unreadable === 1 ? "is" : "are"} skipped.`);
  return parts.join(" ");
}

/**
 * Export… and Import… for the repeaters or the nets, to share them with
 * other operators (shared-lists.md). Importing only adds; it shows what it
 * will add and waits for a confirmation first.
 */
export default function ShareListControls({
  kind,
  selectedOperatorId,
  onImported,
}: {
  kind: ListKind;
  selectedOperatorId: string | null;
  onImported: () => void;
}) {
  const w = WORDS[kind];
  const filters = [{ name: `Radio Operations Console ${w.list}`, extensions: ["db"] }];
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  // A file chosen to import, waiting for confirmation.
  const [pending, setPending] = useState<{ path: string; summary: ImportSummary } | null>(null);

  async function run(work: () => Promise<void>) {
    setMessage(null);
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setMessage({ kind: "error", text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  const exportList = () =>
    run(async () => {
      setPending(null);
      const path = await save({ defaultPath: `${w.title} ${isoDate(new Date())}.db`, filters });
      if (!path) return;
      const n = await api.exportList(kind, path);
      setMessage({ kind: "ok", text: `Exported ${count(n, w)} to ${path}` });
    });

  const chooseImport = () =>
    run(async () => {
      setPending(null);
      const path = await open({ multiple: false, directory: false, filters });
      if (!path || Array.isArray(path)) return;
      setPending({ path, summary: await api.inspectList(kind, path) });
    });

  const confirmImport = () =>
    run(async () => {
      if (!pending) return;
      const done = await api.importList(kind, pending.path, selectedOperatorId);
      setPending(null);
      setMessage({ kind: "ok", text: describeImport(kind, done, true) });
      onImported();
    });

  return (
    <div className="share-list">
      <div className="share-list-buttons">
        <button className="link-button" onClick={exportList} disabled={busy} title={`Save your ${w.many} to a file to share`}>
          Export {w.many}…
        </button>
        <button className="link-button" onClick={chooseImport} disabled={busy} title={`Add ${w.many} from a shared file`}>
          Import {w.many}…
        </button>
      </div>
      {pending && (
        <div className="inline-form confirm-row">
          <span>
            {w.title} list made {new Date(pending.summary.exported_at).toLocaleDateString()}.{" "}
            {describeImport(kind, pending.summary)}
          </span>
          {pending.summary.new > 0 && (
            <button onClick={confirmImport} disabled={busy}>
              Import
            </button>
          )}
          <button onClick={() => setPending(null)} disabled={busy}>
            {pending.summary.new > 0 ? "Cancel" : "Close"}
          </button>
        </div>
      )}
      {message?.kind === "ok" && <p className="qrz-status qrz-status-found">{message.text}</p>}
      {message?.kind === "error" && <p className="weather-area-error">{message.text}</p>}
    </div>
  );
}
