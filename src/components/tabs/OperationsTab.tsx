import { useCallback, useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, Operator, Repeater } from "../../types";
import SelectedActivityPanel from "../operations/SelectedActivityPanel";
import CreateActivityPanel from "../operations/CreateActivityPanel";
import ArchivedActivitiesPanel from "../operations/ArchivedActivitiesPanel";
import OperatorsPanel from "../operations/OperatorsPanel";
import RepeatersPanel from "../operations/RepeatersPanel";
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
          <SelectedActivityPanel
            activities={activities}
            selectedActivityId={selectedActivityId}
            selectedOperatorId={selectedOperatorId}
            onActivitiesChanged={onActivitiesChanged}
            editRequested={editActivityRequested}
            onEditRequestHandled={onEditActivityHandled}
            repeaters={repeaters}
          />
          <CreateActivityPanel
            activities={activities}
            onActivitiesChanged={onActivitiesChanged}
            onSelectActivity={onSelectActivity}
            operators={operators}
            selectedOperatorId={selectedOperatorId}
            repeaters={repeaters}
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
            onRepeatersChanged={refreshRepeaters}
            selectedOperatorId={selectedOperatorId}
          />
        </div>
      </div>
    </>
  );
}
