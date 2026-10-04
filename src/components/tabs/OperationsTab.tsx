import { useCallback, useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, NetListing, Operator, Repeater } from "../../types";
import type { ActivityPrefill } from "../operations/activityPrefill";
import SelectedActivityPanel from "../operations/SelectedActivityPanel";
import CreateActivityPanel from "../operations/CreateActivityPanel";
import ArchivedActivitiesPanel from "../operations/ArchivedActivitiesPanel";
import OperatorsPanel from "../operations/OperatorsPanel";
import RepeatersPanel from "../operations/RepeatersPanel";
import PlacesPanel from "../operations/PlacesPanel";
import { Lightbulb } from "lucide-react";

interface Props {
  activities: Activity[];
  operators: Operator[];
  selectedActivityId: string | null;
  selectedOperatorId: string | null;
  onActivitiesChanged: () => void;
  onOperatorsChanged: () => void;
  onSelectActivity: (id: string) => void;
  onSelectOperator: (id: string | null) => void;
  editActivityRequested: boolean;
  onEditActivityHandled: () => void;
  /** From a net listing's "Start activity": fills the create form. */
  activityPrefill: ActivityPrefill | null;
  onActivityPrefillHandled: () => void;
  /** Open the new-activity form (from the top bar or the button here). */
  newActivityRequested: boolean;
  onNewActivity: () => void;
  onNewActivityHandled: () => void;
}

export default function OperationsTab({
  activities,
  operators,
  selectedActivityId,
  selectedOperatorId,
  onActivitiesChanged,
  onOperatorsChanged,
  onSelectActivity,
  onSelectOperator,
  editActivityRequested,
  onEditActivityHandled,
  activityPrefill,
  onActivityPrefillHandled,
  newActivityRequested,
  onNewActivity,
  onNewActivityHandled,
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


  const isFirstRun = activities.length === 0 && operators.length === 0;

  return (
    <>
      {isFirstRun && (
        <div className="panel tip-panel">
          <h3><Lightbulb className="heading-icon" />Getting started</h3>
          <p className="settings-hint">
            Add an operator on the right, then create your first activity below (e.g. a weekly net).
            Once an activity exists, it's chosen in the top bar and every tab works on it — switch
            to the Check-ins tab to start logging contacts.
          </p>
        </div>
      )}
      <div className="operations-workspace">
        <div className="operations-column">
          <CreateActivityPanel
            activities={activities}
            onActivitiesChanged={onActivitiesChanged}
            onSelectActivity={onSelectActivity}
            operators={operators}
            selectedOperatorId={selectedOperatorId}
            repeaters={repeaters}
            prefill={activityPrefill}
            onPrefillHandled={onActivityPrefillHandled}
            openRequested={newActivityRequested}
            onOpenHandled={onNewActivityHandled}
          />
          <SelectedActivityPanel
            activities={activities}
            selectedActivityId={selectedActivityId}
            selectedOperatorId={selectedOperatorId}
            onActivitiesChanged={onActivitiesChanged}
            editRequested={editActivityRequested}
            onEditRequestHandled={onEditActivityHandled}
            repeaters={repeaters}
            onNewActivity={onNewActivity}
          />
          <ArchivedActivitiesPanel
            activities={activities}
            selectedOperatorId={selectedOperatorId}
            onActivitiesChanged={onActivitiesChanged}
          />
        </div>

        <div className="operations-column operations-column-narrow">
          <OperatorsPanel
            operators={operators}
            selectedOperatorId={selectedOperatorId}
            onOperatorsChanged={onOperatorsChanged}
            onSelectOperator={onSelectOperator}
          />
          <RepeatersPanel
            repeaters={repeaters}
            netCounts={netCounts}
            onRepeatersChanged={refreshRepeaters}
            selectedOperatorId={selectedOperatorId}
          />
          <PlacesPanel selectedOperatorId={selectedOperatorId} />
        </div>
      </div>
    </>
  );
}
