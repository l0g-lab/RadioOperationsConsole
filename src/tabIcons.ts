import {
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  CloudSunRain,
  History,
  RadioTower,
  SatelliteDish,
  Settings,
  Tornado,
  type LucideIcon,
} from "lucide-react";
import type { Tab } from "./types";

/** The icon shown beside each tab's label (never instead of it — UX-007). */
export const TAB_ICONS: Record<Tab, LucideIcon> = {
  Operations: RadioTower,
  "Check-ins": ClipboardCheck,
  "Spotter Reports": Tornado,
  Weather: CloudSunRain,
  APRS: SatelliteDish,
  History: History,
  Nets: CalendarClock,
  Events: CalendarRange,
  Settings: Settings,
};
