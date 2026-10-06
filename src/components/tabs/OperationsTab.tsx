import { useCallback, useEffect, useState } from "react";
import GettingStarted from "../operations/GettingStarted";
import ActivityExportsPanel from "../operations/ActivityExportsPanel";
import type { SettingsSection } from "./SettingsTab";
import * as api from "../../api";
import type { Activity, NetListing, Operator, Repeater, EventRecord } from "../../types";
import type { ActivityPrefill } from "../operations/activityPrefill";
import SelectedActivityPanel from "../operations/SelectedActivityPanel";
import CreateActivityPanel from "../operations/CreateActivityPanel";
import OperatorsPanel from "../operations/OperatorsPanel";
import RepeatersPanel from "../operations/RepeatersPanel";
import PlacesPanel from "../operations/PlacesPanel";

interface Props {
  activities: Activity[];
  operators: Operator[];
  selectedActivityId: string | null;
  /** Who new activities, and things outside an activity, go under. */
  defaultOperatorId: string | null;
  onSetDefaultOperator: (id: string) => void;
  /** Who runs the selected activity. */
  activityOperatorId: string | null;
  onActivitiesChanged: () => void;
  onOperatorsChanged: () => void;
  onSelectActivity: (id: string) => void;
  editActivityRequested: boolean;
  onEditActivityHandled: () => void;
  /** From a net listing's "Start activity": fills the create form. */
  activityPrefill: ActivityPrefill | null;
  onActivityPrefillHandled: () => void;
  /** The events there are, to put activities in. */
  events: EventRecord[];
  /** Goes to the Events tab. */
  onOpenEvents: () => void;
  /** Scroll to the selected activity's exports (from another tab's Exports link). */
  exportsRequested: boolean;
  onExportsHandled: () => void;
  /** Open the new-activity form (from the top bar or the button here). */
  newActivityRequested: boolean;
  onNewActivity: () => void;
  onNewActivityHandled: () => void;
  /** For the getting-started steps. */
  onOpenSettings: (section: SettingsSection) => void;
  onOpenWeather: () => void;
}

export default function OperationsTab({
  activities,
  operators,
  selectedActivityId,
  defaultOperatorId,
  onSetDefaultOperator,
  activityOperatorId,
  onActivitiesChanged,
  onOperatorsChanged,
  onSelectActivity,
  editActivityRequested,
  onEditActivityHandled,
  activityPrefill,
  onActivityPrefillHandled,
  events,
  onOpenEvents,
  exportsRequested,
  onExportsHandled,
  newActivityRequested,
  onNewActivity,
  onNewActivityHandled,
  onOpenSettings,
  onOpenWeather,
}: Props) {

  // The repeater directory, shared by its panel and the activity forms.
  const [repeaters, setRepeaters] = useState<Repeater[]>([]);
  const refreshRepeaters = useCallback(() => {
    api
      .listRepeaters()
      .then(setRepeaters)
      .catch(() => setRepeaters([]));
  }, []);
  useEffect(refreshRepeaters, [refreshRepeaters]);

  // How many nets meet on each repeater, shown in the directory (NETL-022).
  const [listings, setListings] = useState<NetListing[]>([]);
  useEffect(() => {
    api
      .listNetListings()
      .then(setListings)
      .catch(() => setListings([]));
  }, []);
  const netCounts = new Map<string, number>();
  for (const l of listings) {
    if (l.repeater_id) netCounts.set(l.repeater_id, (netCounts.get(l.repeater_id) ?? 0) + 1);
  }



  const selectedActivity = activities.find((a) => a.id === selectedActivityId) ?? null;

  return (
    <>
      <GettingStarted
        hasOperators={operators.length > 0}
        hasActivities={activities.length > 0}
        onNewActivity={onNewActivity}
        onOpenSettings={onOpenSettings}
        onOpenWeather={onOpenWeather}
      />
      <div className="operations-workspace">
        <div className="operations-column">
          <CreateActivityPanel
            activities={activities}
            onActivitiesChanged={onActivitiesChanged}
            onSelectActivity={onSelectActivity}
            operators={operators}
            selectedOperatorId={defaultOperatorId}
            repeaters={repeaters}
            prefill={activityPrefill}
            onPrefillHandled={onActivityPrefillHandled}
            events={events}
            openRequested={newActivityRequested}
            onOpenHandled={onNewActivityHandled}
          />
          <SelectedActivityPanel
            activities={activities}
            selectedActivityId={selectedActivityId}
            selectedOperatorId={activityOperatorId}
            operators={operators}
            onActivitiesChanged={onActivitiesChanged}
            editRequested={editActivityRequested}
            onEditRequestHandled={onEditActivityHandled}
            repeaters={repeaters}
            events={events}
          />
          {selectedActivity && (
            <ActivityExportsPanel
              activity={selectedActivity}
              operator={operators.find((o) => o.id === activityOperatorId) ?? null}
              onOpenEvents={onOpenEvents}
              scrollRequested={exportsRequested}
              onScrollHandled={onExportsHandled}
            />
          )}
        </div>

        <div className="operations-column operations-column-narrow">
          <OperatorsPanel
            operators={operators}
            selectedOperatorId={defaultOperatorId}
            onOperatorsChanged={onOperatorsChanged}
            onSetDefault={onSetDefaultOperator}
            onSelectActivity={onSelectActivity}
          />
          <RepeatersPanel
            repeaters={repeaters}
            netCounts={netCounts}
            onRepeatersChanged={refreshRepeaters}
            selectedOperatorId={defaultOperatorId}
          />
          <PlacesPanel selectedOperatorId={defaultOperatorId} />
        </div>
      </div>
    </>
  );
}
