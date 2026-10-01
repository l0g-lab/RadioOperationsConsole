import { TABS, type Tab } from "../types";
import { TAB_ICONS } from "../tabIcons";

interface TabBarProps {
  current: Tab;
  onSelect: (tab: Tab) => void;
}

export default function TabBar({ current, onSelect }: TabBarProps) {
  return (
    <div className="tab-bar">
      {TABS.map((t) => {
        const Icon = TAB_ICONS[t];
        return (
          <button
            key={t}
            className={"tab-button" + (t === current ? " selected" : "")}
            onClick={() => onSelect(t)}
          >
            <Icon className="tab-icon" />
            {t}
          </button>
        );
      })}
    </div>
  );
}
