import { useId, useState, type ReactNode } from "react";

/**
 * A small "i" button that shows or hides an explanation, so settings stay
 * compact until someone wants the detail.
 */
export default function InfoToggle({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className="info-toggle"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${open ? "Hide" : "Show"} information about ${label}`}
        title={open ? "Hide information" : "About this setting"}
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      {open && (
        <div id={id} className="info-body settings-hint">
          {children}
        </div>
      )}
    </>
  );
}
