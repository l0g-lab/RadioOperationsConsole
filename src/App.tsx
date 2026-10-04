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
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedCheckinId, setSelectedCheckinId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<Tab>("Operations");
  // Set by the header's Edit link; the activity panel opens its edit form and clears it.
  const [editActivityRequested, setEditActivityRequested] = useState(false);
  const [focusCallSignSignal, setFocusCallSignSignal] = useState(0);
  // Set by a net listing's "Start activity"; the create form fills from it and clears it.
  const [activityPrefill, setActivityPrefill] = useState<ActivityPrefill | null>(null);
  const [zoom, setZoom] = useState(loadSavedZoom);

  const refreshOperators = useCallback(() => {
    api.listOperators().then((ops) => {
      setOperators(ops);
      // A deleted or retired current operator is dropped from the list, so
      // move to another one rather than keep pointing at them (AUDIT-014).
      setSelectedOperatorId((prev) =>
        prev && ops.some((o) => o.id === prev) ? prev : (ops[0]?.id ?? null)
      );
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

  return (
    <div className="app-shell">
      <Header
        operators={operators}
        selectedOperatorId={selectedOperatorId}
        onSelectOperator={setSelectedOperatorId}
        activities={activities}
        selectedActivityId={selectedActivityId}
        onSelectActivity={setSelectedActivityId}
        onActivitiesChanged={refreshActivities}
        onEditActivity={() => {
          setCurrentTab("Operations");
          setEditActivityRequested(true);
        }}
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
              selectedOperatorId={selectedOperatorId}
              onActivitiesChanged={refreshActivities}
              onOperatorsChanged={refreshOperators}
              onSelectActivity={setSelectedActivityId}
              onSelectOperator={setSelectedOperatorId}
              editActivityRequested={editActivityRequested}
              onEditActivityHandled={() => setEditActivityRequested(false)}
              activityPrefill={activityPrefill}
              onActivityPrefillHandled={() => setActivityPrefill(null)}
            />
          )}
          {currentTab === "Check-ins" && (
            <CheckinsTab
              activities={activities}
              operators={operators}
              selectedActivityId={selectedActivityId}
              selectedOperatorId={selectedOperatorId}
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
              selectedOperatorId={selectedOperatorId}
              operators={operators}
              onOpenExports={() => setCurrentTab("Exports")}
            />
          )}
          {currentTab === "Weather" && <WeatherTab />}
          {currentTab === "APRS" && (
            <MapAprsTab operators={operators} selectedOperatorId={selectedOperatorId} />
          )}
          {currentTab === "Exports" && (
            <ExportsTab
              activity={selectedActivity ?? null}
              operator={operators.find((o) => o.id === selectedOperatorId) ?? null}
            />
          )}
          {currentTab === "History" && <HistoryTab />}
          {currentTab === "Nets" && (
            <NetsTab
              operators={operators}
              selectedOperatorId={selectedOperatorId}
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
