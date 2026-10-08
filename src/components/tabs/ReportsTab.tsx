import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, Checkin, Operator, SpotterReport } from "../../types";
import SpotterReportForm from "../reports/SpotterReportForm";
import SpotterReportRoster from "../reports/SpotterReportRoster";
import NetAlertsPanel from "../reports/NetAlertsPanel";
import ClosedBanner from "../lifecycle/ClosedBanner";
import NotStartedBanner from "../lifecycle/NotStartedBanner";

interface Props {
  activities: Activity[];
  selectedActivityId: string | null;
  selectedOperatorId: string | null;
  operators: Operator[];
  onOpenExports: () => void;
  /** A check-in whose Report was clicked on the roster: start a report from it (SPOT-024). */
  reportFromCheckin: string | null;
  onReportFromCheckinHandled: () => void;
}

export default function ReportsTab({
  activities,
  selectedActivityId,
  selectedOperatorId,
  operators,
  onOpenExports,
  reportFromCheckin,
  onReportFromCheckinHandled,
}: Props) {
  const operator = operators.find((o) => o.id === selectedOperatorId) ?? null;
  const [reports, setReports] = useState<SpotterReport[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  // Which activity's check-ins are loaded, so a Report request waits for them.
  const [checkinsFor, setCheckinsFor] = useState<string | null>(null);
  // A report started from a roster row; `n` starts it again for the same station.
  const [startFrom, setStartFrom] = useState<{ checkin: Checkin; n: number } | null>(null);
  const [qrzConfigured, setQrzConfigured] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => setQrzConfigured(Boolean(s.qrz_username && s.qrz_password)))
      .catch(() => setQrzConfigured(false));
  }, []);

  function refreshCheckins() {
    if (!selectedActivityId) return Promise.resolve();
    return api
      .listCheckins(selectedActivityId)
      .then(setCheckins)
      .catch(() => setCheckins([]));
  }

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
      const id = selectedActivityId;
      api
        .listCheckins(id)
        .then(setCheckins)
        .catch(() => setCheckins([]))
        .finally(() => setCheckinsFor(id));
    } else {
      setReports([]);
      setCheckins([]);
      setCheckinsFor(null);
    }
    setSelectedReportId(null);
    setEditingReportId(null);
    setStartFrom(null);
  }, [selectedActivityId]);

  // A Report clicked on the roster: once this net's check-ins are in, start
  // a report from that station.
  useEffect(() => {
    if (!reportFromCheckin || !selectedActivityId || checkinsFor !== selectedActivityId) return;
    const c = checkins.find((x) => x.id === reportFromCheckin);
    if (c) {
      setEditingReportId(null);
      setStartFrom({ checkin: c, n: Date.now() });
    }
    onReportFromCheckinHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportFromCheckin, checkinsFor, selectedActivityId, checkins]);

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
          <NotStartedBanner activity={focusedActivity} />
          {focusedActivity.activity_type === "skywarn" && (
            <NetAlertsPanel activity={focusedActivity} operatorId={selectedOperatorId} />
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
              startFrom={startFrom}
              qrzConfigured={qrzConfigured}
              onSaved={async (newId) => {
                // Saving may have logged the reporter as a new check-in.
                await Promise.all([refreshReports(), refreshCheckins()]);
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
