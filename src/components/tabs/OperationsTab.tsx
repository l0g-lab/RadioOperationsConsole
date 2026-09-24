import { useCallback, useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, ActivityTemplate, Operator } from "../../types";
import SelectedActivityPanel from "../operations/SelectedActivityPanel";
import CreateActivityPanel from "../operations/CreateActivityPanel";
import TemplatesPanel from "../operations/TemplatesPanel";
import ArchivedActivitiesPanel from "../operations/ArchivedActivitiesPanel";
import OperatorsPanel from "../operations/OperatorsPanel";

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
  // Owned here so the create form and the selected-activity panel see the same list.
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);
  const refreshTemplates = useCallback(() => {
    api
      .listActivityTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);
  useEffect(refreshTemplates, [refreshTemplates]);

  // Which template the Templates panel asked the create form to start from.
  const [useTemplateRequest, setUseTemplateRequest] = useState<string | null>(null);

  const isFirstRun = activities.length === 0 && operators.length === 0;

  return (
    <>
      {isFirstRun && (
        <div className="panel tip-panel">
          <h3>Getting started</h3>
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
            templates={templates}
            onTemplatesChanged={refreshTemplates}
          />
          <CreateActivityPanel
            activities={activities}
            onActivitiesChanged={onActivitiesChanged}
            onSelectActivity={onSelectActivity}
            operators={operators}
            selectedOperatorId={selectedOperatorId}
            templates={templates}
            onTemplatesChanged={refreshTemplates}
            useTemplateRequest={useTemplateRequest}
            onUseTemplateHandled={() => setUseTemplateRequest(null)}
          />
          <TemplatesPanel
            templates={templates}
            onTemplatesChanged={refreshTemplates}
            onCreateFrom={setUseTemplateRequest}
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
            onOperatorsChanged={onOperatorsChanged}
            onSelectOperator={onSelectOperator}
          />
        </div>
      </div>
    </>
  );
}
