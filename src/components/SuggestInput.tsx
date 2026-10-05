import { useState, type CSSProperties, type ReactNode } from "react";

export interface Suggestion {
  /** What goes in the box when it's taken. */
  value: string;
  /** How it shows in the list; the value if not given. */
  label?: ReactNode;
}

/**
 * A free-text box with suggestions as you type. The webview's own suggestion
 * list (a datalist) can't be styled or accepted with Tab, so this is a small
 * one of our own: the first match is highlighted, Tab takes it and moves on as
 * Tab normally does, Enter takes it (a second Enter then does what Enter does
 * in the form), arrows move the highlight, Escape closes the list.
 *
 * The list shows only after typing, so a box filled in for editing stays quiet.
 */
export default function SuggestInput({
  value,
  onChange,
  suggest,
  onEnter,
  id,
  ariaLabel,
  listLabel,
  placeholder,
  className,
  style,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The suggestions for what's typed; none closes the list. */
  suggest: (typed: string) => Suggestion[];
  /** Enter with the list closed. */
  onEnter?: () => void;
  /** Ties the list to the box for screen readers; unique on the page. */
  id: string;
  ariaLabel?: string;
  listLabel: string;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = open ? suggest(value) : [];
  const shown = suggestions.length > 0;
  const listId = `${id}-suggestions`;
  const optionId = (i: number) => `${listId}-${i}`;

  function take(s: Suggestion) {
    onChange(s.value);
    setOpen(false);
  }

  return (
    <span className="suggest-input">
      <input
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown ? optionId(active) : undefined}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={className}
        style={style}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (shown && e.key === "Tab" && !e.shiftKey) {
            // Not prevented: focus still moves on to the next field.
            take(suggestions[active]);
          } else if (shown && e.key === "Enter") {
            // Taking a suggestion isn't also a save.
            e.preventDefault();
            e.stopPropagation();
            take(suggestions[active]);
          } else if (shown && e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % suggestions.length);
          } else if (shown && e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
          } else if (shown && e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          } else if (e.key === "Enter") {
            onEnter?.();
          }
        }}
      />
      {shown && (
        <ul id={listId} role="listbox" aria-label={listLabel} className="suggest-list">
          {suggestions.map((s, i) => (
            <li
              key={s.value}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : undefined}
              // Before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                take(s);
              }}
            >
              {s.label ?? s.value}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
