import { useState } from "react";

/** Asks for a name and saves the current activity setup as a reusable template. */
export default function SaveTemplateBar({
  defaultName,
  existingNames,
  onSave,
  onCancel,
}: {
  defaultName: string;
  existingNames: string[];
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const replaces = existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());

  async function save() {
    if (!trimmed) {
      setError("Give the template a name.");
      return;
    }
    try {
      await onSave(trimmed);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="inline-form">
      <label>
        Template name:
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") onCancel();
          }}
        />
      </label>
      <button onClick={save}>{replaces ? "Replace template" : "Save template"}</button>
      <button onClick={onCancel}>Cancel</button>
      {replaces && !error && (
        <span className="settings-hint">
          A template with this name exists and will be replaced.
        </span>
      )}
      {error && <span className="weather-area-error">{error}</span>}
    </div>
  );
}
