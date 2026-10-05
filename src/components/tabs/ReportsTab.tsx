import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, Checkin, Operator, SpotterReport } from "../../types";
import SpotterReportForm from "../reports/SpotterReportForm";
import SpotterReportRoster from "../reports/SpotterReportRoster";
import NetWeatherNow from "../reports/NetWeatherNow";
import ClosedBanner from "../lifecycle/ClosedBanner";

interface Props {
  activities: Activity[];
  selectedActivityId: string | null;
  selectedOperatorId: string | null;
  operators: Operator[];
  onOpenExports: () => void;
}

export default function ReportsTab({
  activities,
  selectedActivityId,
  selectedOperatorId,
  operators,
  onOpenExports,
}: Props) {
  const operator = operators.find((o) => o.id === selectedOperatorId) ?? null;
  const [reports, setReports] = useState<SpotterReport[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

  const focusedActivity = activities.find((a) => a.id === selectedActivityId) ?? null;
  const editingReport = reports.find((r) => r.id === editingReportId) ?? null;

  function refreshReports() {
    if (!selectedActivityId) return Promise.resolve();
    return api
      .listSpotterReports(selectedActivityId)
      .then(setReports)
      .catch(() => setReports([]));
  }

  useEffect(() => {
    if (selectedActivityId) {
      api
        .listSpotterReports(selectedActivityId)
        .then(setReports)
        .catch(() => setReports([]));
      api
        .listCheckins(selectedActivityId)
        .then(setCheckins)
        .catch(() => setCheckins([]));
    } else {
      setReports([]);
      setCheckins([]);
    }
    setSelectedReportId(null);
    setEditingReportId(null);
  }, [selectedActivityId]);

  return (
    <div className="checkin-workspace">
      {!focusedActivity && (
        <p className="checkin-empty-state">
          Choose an activity in the top bar (or create one on the Operations tab) to log spotter
          reports against it.
        </p>
      )}

      {focusedActivity && (
        <>
          {focusedActivity.activity_type === "skywarn" && focusedActivity.state === "active" && (
            <NetWeatherNow activity={focusedActivity} />
          )}
          {focusedActivity.state === "closed" ? (
            <ClosedBanner title={focusedActivity.title} />
          ) : (
            <SpotterReportForm
              activityId={focusedActivity.id}
              operatorId={selectedOperatorId}
              checkins={checkins}
              counties={reports.map((r) => r.county)}
              editingReport={editingReport}
              onSaved={async (newId) => {
                await refreshReports();
                if (newId) setSelectedReportId(newId);
                setEditingReportId(null);
              }}
              onCancelEdit={() => setEditingReportId(null)}
            />
          )}

          <SpotterReportRoster
            activity={focusedActivity}
            operatorId={selectedOperatorId}
            reports={reports}
            onOpenExports={onOpenExports}
            operatorName={operator?.display_name ?? ""}
            operatorCall={operator?.call_sign ?? ""}
            readOnly={focusedActivity.state === "closed"}
            selectedReportId={selectedReportId}
            editingReportId={editingReportId}
            onSelectReport={setSelectedReportId}
            onEdit={setEditingReportId}
            onReportsChanged={refreshReports}
          />
        </>
      )}
    </div>
  );
}
