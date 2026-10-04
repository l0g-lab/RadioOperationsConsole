import { useCallback, useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import * as api from "./api";
import Header from "./components/Header";
import TabBar from "./components/TabBar";
import OperationsSidebar from "./components/OperationsSidebar";
import OperationsTab from "./components/tabs/OperationsTab";
import CheckinsTab from "./components/tabs/CheckinsTab";
import ReportsTab from "./components/tabs/ReportsTab";
import WeatherTab from "./components/tabs/WeatherTab";
import MapAprsTab from "./components/tabs/MapAprsTab";
import ExportsTab from "./components/tabs/ExportsTab";
import HistoryTab from "./components/tabs/HistoryTab";
import SettingsTab from "./components/tabs/SettingsTab";
import NetsTab from "./components/tabs/NetsTab";
import type { ActivityPrefill } from "./components/operations/activityPrefill";
import UpgradeBackupBanner from "./components/UpgradeBackupBanner";
import UpdateBanner from "./components/UpdateBanner";
import type { Activity, Operator, Tab } from "./types";
import { TABS } from "./types";
import { isLog, isRelay } from "./activityTypes";
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

  const refreshActivities = useCallback(() => {
    api.listActivities().then((acts) => {
      setActivities(acts);
      // If the previously focused activity was archived (and so dropped from
      // this list), reassign focus rather than leaving it pointed at a
      // hidden activity (UX-OPS-014).
      setSelectedActivityId((prev) =>
        prev && acts.some((a) => a.id === prev) ? prev : (acts[0]?.id ?? null)
      );
    });
  }, []);

  useEffect(() => {
    refreshOperators();
    refreshActivities();
  }, [refreshOperators, refreshActivities]);

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
      if (idx >= 1 && idx <= 9) {
        e.preventDefault();
        const tab = TABS[idx - 1];
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
  const runByOperator = operators.find((o) => o.id === runBy) ?? null;

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
        {currentTab === "Operations" && (
          <OperationsSidebar
            activities={activities}
            selectedActivityId={selectedActivityId}
            onSelectActivity={setSelectedActivityId}
          />
        )}
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
              newActivityRequested={newActivityRequested}
              onNewActivity={requestNewActivity}
              onNewActivityHandled={() => setNewActivityRequested(false)}
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
              onOpenExports={() => setCurrentTab("Exports")}
            />
          )}
          {currentTab === "Spotter Reports" && (
            <ReportsTab
              activities={activities}
              selectedActivityId={selectedActivityId}
              selectedOperatorId={runBy}
              operators={operators}
              onOpenExports={() => setCurrentTab("Exports")}
            />
          )}
          {currentTab === "Weather" && <WeatherTab />}
          {currentTab === "APRS" && (
            <MapAprsTab operators={operators} selectedOperatorId={defaultOperatorId} />
          )}
          {currentTab === "Exports" && (
            <ExportsTab
              activity={selectedActivity ?? null}
              operator={runByOperator}
              defaultOperator={operators.find((o) => o.id === defaultOperatorId) ?? null}
            />
          )}
          {currentTab === "History" && <HistoryTab />}
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
          {currentTab === "Settings" && <SettingsTab />}
        </main>
      </div>
    </div>
  );
}
