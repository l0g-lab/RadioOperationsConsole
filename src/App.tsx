import { useCallback, useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import * as api from "./api";
import Header from "./components/Header";
import TabBar from "./components/TabBar";
import OperationsTab from "./components/tabs/OperationsTab";
import CheckinsTab from "./components/tabs/CheckinsTab";
import ReportsTab from "./components/tabs/ReportsTab";
import WeatherTab from "./components/tabs/WeatherTab";
import MapAprsTab from "./components/tabs/MapAprsTab";
import EventsTab from "./components/tabs/EventsTab";
import HistoryTab from "./components/tabs/HistoryTab";
import SettingsTab, { type SettingsSection } from "./components/tabs/SettingsTab";
import NetsTab from "./components/tabs/NetsTab";
import type { ActivityPrefill } from "./components/operations/activityPrefill";
import UpgradeBackupBanner from "./components/UpgradeBackupBanner";
import UpdateBanner from "./components/UpdateBanner";
import type { Activity, EventRecord, Operator, Tab } from "./types";
import { TABS } from "./types";
import { todayIso } from "./utils";
import { DEFAULT_ACTIVITY_TYPE, isLog, isRelay } from "./activityTypes";
import { activityOperatorId, loadDefaultOperatorId, saveDefaultOperatorId } from "./defaultOperator";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;
const ZOOM_STORAGE_KEY = "roc-zoom-level";

function loadSavedZoom(): number {
  try {
    const saved = parseFloat(localStorage.getItem(ZOOM_STORAGE_KEY) ?? "");
    return Number.isFinite(saved) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, saved)) : 1;
  } catch {
    return 1;
  }
}

export default function App() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  // Who new activities and anything outside an activity go under; each
  // activity has its own operator (defaultOperator.ts).
  const [defaultOperatorId, setDefaultOperatorId] = useState<string | null>(null);
  const setDefaultOperator = (id: string) => {
    saveDefaultOperatorId(id);
    setDefaultOperatorId(id);
  };
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedCheckinId, setSelectedCheckinId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<Tab>("Operations");
  // Set by the header's Edit link; the activity panel opens its edit form and clears it.
  const [editActivityRequested, setEditActivityRequested] = useState(false);
  const [newActivityRequested, setNewActivityRequested] = useState(false);
  // Set by the Exports links on other tabs; the Operations tab scrolls to the activity's exports.
  const [exportsRequested, setExportsRequested] = useState(false);
  const openExports = () => {
    setCurrentTab("Operations");
    setExportsRequested(true);
  };
  // A Settings section to go straight to (getting started, the Check-ins hint).
  const [settingsFocus, setSettingsFocus] = useState<SettingsSection | null>(null);
  const openSettings = (section: SettingsSection) => {
    setCurrentTab("Settings");
    setSettingsFocus(section);
  };
  const requestNewActivity = () => {
    setCurrentTab("Operations");
    setNewActivityRequested(true);
  };
  const [focusCallSignSignal, setFocusCallSignSignal] = useState(0);
  // Set by a net listing's "Start activity"; the create form fills from it and clears it.
  const [activityPrefill, setActivityPrefill] = useState<ActivityPrefill | null>(null);
  const [zoom, setZoom] = useState(loadSavedZoom);

  const refreshOperators = useCallback(() => {
    api.listOperators().then((ops) => {
      setOperators(ops);
      // A deleted or retired default is dropped from the list, so move to
      // another one rather than keep pointing at them (AUDIT-014).
      setDefaultOperatorId(loadDefaultOperatorId(ops));
    });
  }, []);

  // Events (docs/features/events.md), for the Events tab and the activity forms.
  const [events, setEvents] = useState<EventRecord[]>([]);
  const refreshEvents = useCallback(() => {
    api
      .listEvents()
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  const refreshActivities = useCallback(() => {
    api.listActivities().then((acts) => {
      setActivities(acts);
      // If the previously focused activity was deleted (and so dropped from
      // this list), reassign focus rather than leaving it pointed at a
      // missing activity (UX-OPS-014).
      setSelectedActivityId((prev) =>
        prev && acts.some((a) => a.id === prev) ? prev : (acts[0]?.id ?? null)
      );
    });
  }, []);

  useEffect(() => {
    refreshOperators();
    refreshActivities();
    refreshEvents();
  }, [refreshOperators, refreshActivities, refreshEvents]);

  useEffect(() => {
    getCurrentWebview()
      .setZoom(zoom)
      .catch(() => {
        // Not running inside Tauri (e.g. plain browser dev preview) — ignore.
      });
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
    } catch {
      // Storage unavailable (private mode, etc.) — zoom just won't persist.
    }
  }, [zoom]);

  // Ctrl+[ / Ctrl+] step through activities, wrapping around, so switching
  // between concurrent nets doesn't need the mouse.
  const stepActivity = useCallback(
    (delta: number) => {
      if (activities.length === 0) return;
      const i = activities.findIndex((a) => a.id === selectedActivityId);
      const next = (i + delta + activities.length) % activities.length;
      setSelectedActivityId(activities[next].id);
    },
    [activities, selectedActivityId]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey) return;

      if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        stepActivity(e.key === "]" ? 1 : -1);
        return;
      }

      if (e.shiftKey) {
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100));
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100));
        } else if (e.key === "0" || e.key === ")") {
          e.preventDefault();
          setZoom(1);
        }
        return;
      }

      const idx = parseInt(e.key, 10);
      if (idx >= 0 && idx <= 9) {
        e.preventDefault();
        // Ctrl+0 is the tenth tab.
        const tab = TABS[idx === 0 ? 9 : idx - 1];
        if (tab) setCurrentTab(tab);
        return;
      }
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCurrentTab("Check-ins");
        setFocusCallSignSignal((n) => n + 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stepActivity]);

  const selectedActivity = activities.find((a) => a.id === selectedActivityId);
  // Everything recorded in the selected activity goes under its operator.
  const runBy = activityOperatorId(selectedActivity, defaultOperatorId);

  return (
    <div className="app-shell">
      <Header
        operators={operators}
        activityOperatorId={runBy}
        activities={activities}
        selectedActivityId={selectedActivityId}
        onSelectActivity={setSelectedActivityId}
        onActivitiesChanged={refreshActivities}
        onEditActivity={() => {
          setCurrentTab("Operations");
          setEditActivityRequested(true);
        }}
        onNewActivity={requestNewActivity}
      />
      <UpgradeBackupBanner />
      <UpdateBanner />
      <div className="app-body">
        <main className="app-content">
          <TabBar
            current={currentTab}
            onSelect={setCurrentTab}
            labels={
              selectedActivity && isLog(selectedActivity.activity_type)
                ? { "Check-ins": "Contacts" }
                : selectedActivity && isRelay(selectedActivity.activity_type)
                  ? { "Check-ins": "Messages" }
                  : undefined
            }
          />
          {currentTab === "Operations" && (
            <OperationsTab
              activities={activities}
              operators={operators}
              selectedActivityId={selectedActivityId}
              defaultOperatorId={defaultOperatorId}
              activityOperatorId={runBy}
              onActivitiesChanged={refreshActivities}
              onOperatorsChanged={refreshOperators}
              onSelectActivity={setSelectedActivityId}
              onSetDefaultOperator={setDefaultOperator}
              editActivityRequested={editActivityRequested}
              onEditActivityHandled={() => setEditActivityRequested(false)}
              activityPrefill={activityPrefill}
              onActivityPrefillHandled={() => setActivityPrefill(null)}
              events={events}
              onOpenEvents={() => setCurrentTab("Events")}
              exportsRequested={exportsRequested}
              onExportsHandled={() => setExportsRequested(false)}
              newActivityRequested={newActivityRequested}
              onNewActivity={requestNewActivity}
              onNewActivityHandled={() => setNewActivityRequested(false)}
              onOpenSettings={openSettings}
              onOpenWeather={() => setCurrentTab("Weather")}
            />
          )}
          {currentTab === "Check-ins" && (
            <CheckinsTab
              activities={activities}
              operators={operators}
              selectedActivityId={selectedActivityId}
              selectedOperatorId={runBy}
              selectedCheckinId={selectedCheckinId}
              onSelectCheckin={setSelectedCheckinId}
              focusCallSignSignal={focusCallSignSignal}
              onOpenExports={openExports}
              onOpenCallsignDirectories={() => openSettings("callsigns")}
            />
          )}
          {currentTab === "Spotter Reports" && (
            <ReportsTab
              activities={activities}
              selectedActivityId={selectedActivityId}
              selectedOperatorId={runBy}
              operators={operators}
              onOpenExports={openExports}
            />
          )}
          {currentTab === "Weather" && <WeatherTab />}
          {currentTab === "APRS" && (
            <MapAprsTab operators={operators} selectedOperatorId={defaultOperatorId} />
          )}
          {currentTab === "History" && <HistoryTab />}
          {currentTab === "Events" && (
            <EventsTab
              events={events}
              activities={activities}
              operators={operators}
              defaultOperatorId={defaultOperatorId}
              onEventsChanged={refreshEvents}
              onActivitiesChanged={refreshActivities}
              onOpenActivity={(id) => {
                setSelectedActivityId(id);
                setCurrentTab("Operations");
              }}
              onAddActivity={(eventId) => {
                setActivityPrefill({
                  title: "",
                  activityType: DEFAULT_ACTIVITY_TYPE,
                  date: todayIso(),
                  time: "",
                  frequency: "",
                  repeater: null,
                  eventId,
                });
                setCurrentTab("Operations");
              }}
            />
          )}
          {currentTab === "Nets" && (
            <NetsTab
              operators={operators}
              selectedOperatorId={defaultOperatorId}
              onStartActivity={(prefill) => {
                setActivityPrefill(prefill);
                setCurrentTab("Operations");
              }}
            />
          )}
          {currentTab === "Settings" && (
            <SettingsTab focus={settingsFocus} onFocusHandled={() => setSettingsFocus(null)} />
          )}
        </main>
      </div>
    </div>
  );
}
