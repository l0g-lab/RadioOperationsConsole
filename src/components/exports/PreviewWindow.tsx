import { useEffect, useMemo, useState } from "react";
import { parseCsv, saveTextFile } from "../../export";
import { FileSearch } from "lucide-react";
import { ActionMessage, useEscape } from "./SummaryView";

/** Copy and Save for an export's text, with a message saying how it went. */
export function useTextFileActions(filename: string, text: string | null, what: string) {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  // A message about another activity's file doesn't carry over.
  useEffect(() => setMessage(null), [filename]);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ text: `Copied ${what}.`, error: false });
    } catch {
      setMessage({ text: "Couldn't copy to the clipboard — use Save instead.", error: true });
    }
  }

  async function save() {
    if (!text) return;
    try {
      const path = await saveTextFile(filename, text);
      if (path) setMessage({ text: `Saved to ${path}`, error: false });
    } catch (e) {
      setMessage({ text: `Couldn't save: ${e}`, error: true });
    }
  }

  return { copy, save, message };
}

/**
 * A window showing an export before it's saved, with Copy and Save of the
 * exact text (EXPORT-017, EXPORT-018). `text` is null while it loads.
 */
export function PreviewWindow({
  heading,
  filename,
  text,
  what,
  failed = false,
  wide = false,
  extra,
  onClose,
  children,
}: {
  heading: string;
  /** Suggested name when saving. */
  filename: string;
  text: string | null;
  /** For messages: "the summary", "the check-ins". */
  what: string;
  failed?: boolean;
  /** Room for a table with many columns. */
  wide?: boolean;
  /** Shown beside Copy and Save. */
  extra?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEscape(onClose);
  const { copy, save, message } = useTextFileActions(filename, text, what);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={"modal-panel lifecycle-modal summary-modal" + (wide ? " preview-modal-wide" : "")}
        role="dialog"
        aria-label={heading}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>
            <FileSearch className="heading-icon" />
            {heading}
          </h3>
          <button onClick={onClose}>Close</button>
        </div>
        {failed && <p className="weather-area-error">Couldn't load it.</p>}
        {!failed && text == null && <p className="settings-hint">Loading…</p>}
        {text != null && children}
        <div className="inline-form">
          <button onClick={copy} disabled={text == null} title="Copy exactly what Save writes">
            Copy
          </button>
          <button onClick={save} disabled={text == null} title="Save it as a file">
            Save…
          </button>
          {extra}
          <ActionMessage message={message} />
        </div>
      </div>
    </div>
  );
}

/**
 * A CSV export shown as a table, read back from the exact text that's saved,
 * with the raw text a click away (EXPORT-018).
 */
export function CsvPreviewDialog({
  heading,
  filename,
  csv,
  what,
  onClose,
}: {
  heading: string;
  filename: string;
  csv: string;
  what: string;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState(false);
  const [header, ...rows] = useMemo(() => parseCsv(csv), [csv]);
  return (
    <PreviewWindow
      heading={heading}
      filename={filename}
      text={csv}
      what={what}
      wide
      onClose={onClose}
      extra={
        <label className="checkbox-row">
          <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} />
          Show as text
        </label>
      }
    >
      <p className="settings-hint">
        {rows.length} {rows.length === 1 ? "row" : "rows"}, {header?.length ?? 0} columns — exactly
        what the CSV file holds.
      </p>
      {raw ? (
        <pre className="summary-text csv-raw">{csv}</pre>
      ) : (
        <div className="csv-table-wrap">
          <table className="csv-table">
            <thead>
              <tr>
                {header?.map((h, i) => (
                  <th key={i} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PreviewWindow>
  );
}
