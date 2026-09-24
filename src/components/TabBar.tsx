import { TABS, type Tab } from "../types";

interface TabBarProps {
  current: Tab;
  onSelect: (tab: Tab) => void;
}

export default function TabBar({ current, onSelect }: TabBarProps) {
  return (
    <div className="tab-bar">
      {TABS.map((t) => (
        <button
          key={t}
          className={"tab-button" + (t === current ? " selected" : "")}
          onClick={() => onSelect(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
