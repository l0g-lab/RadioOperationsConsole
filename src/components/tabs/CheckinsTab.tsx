import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, Checkin, Operator, SpotterReport } from "../../types";
import { formatCoordsWithGrid } from "../../geo";
import CheckinLocationMap from "../CheckinLocationMap";
import { netControlPoint, repeaterPoint } from "../../mapPoints";
import CheckinEntryForm from "../checkins/CheckinEntryForm";
import CheckinRoster from "../checkins/CheckinRoster";
import NotStartedBanner from "../lifecycle/NotStartedBanner";
import ClosedBanner from "../lifecycle/ClosedBanner";
import { isLog, isRangeCheck, isRelay, isSkywarn } from "../../activityTypes";
import RelayWorkspace from "../relay/RelayWorkspace";

interface Props {
  activities: Activity[];
  operators: Operator[];
  selectedActivityId: string | null;
  selectedOperatorId: string | null;
  selectedCheckinId: string | null;
  onSelectCheckin: (id: string | null) => void;
  focusCallSignSignal: number;
  onOpenExports: () => void;
  /** Goes to Settings → the FCC call-sign directories. */
  onOpenCallsignDirectories: () => void;
  /** Takes a spotter report from a checked-in station, on the Spotter Reports tab (SPOT-024). */
  onTakeReport: (checkinId: string) => void;
}

/** Each check-in's linked reports' hazards, oldest first. */
function hazardsByCheckin(reports: SpotterReport[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of [...reports].sort((a, b) => a.reported_at.localeCompare(b.reported_at))) {
    if (!r.checkin_id) continue;
    out.set(r.checkin_id, [...(out.get(r.checkin_id) ?? []), r.hazard_type]);
  }
  return out;
}

export default function CheckinsTab({
  activities,
  operators,
  selectedActivityId,
  selectedOperatorId,
  selectedCheckinId,
  onSelectCheckin,
  focusCallSignSignal,
  onOpenExports,
  onOpenCallsignDirectories,
  onTakeReport,
}: Props) {
  const [rapidEntryMode, setRapidEntryMode] = useState(true);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [qrzConfigured, setQrzConfigured] = useState(false);
  const [offlineCallsAvailable, setOfflineCallsAvailable] = useState(false);
  // Whether any way of filling in call signs exists; null until known.
  const [canLookUp, setCanLookUp] = useState<boolean | null>(null);
  const [showMap, setShowMap] = useState(false);

  const focusedActivity = activities.find((a) => a.id === selectedActivityId) ?? null;
  const closed = focusedActivity?.state === "closed";
  const log = focusedActivity ? isLog(focusedActivity.activity_type) : false;
  const rangeCheck = focusedActivity ? isRangeCheck(focusedActivity.activity_type) : false;
  const relay = focusedActivity ? isRelay(focusedActivity.activity_type) : false;
  const skywarn = focusedActivity ? isSkywarn(focusedActivity.activity_type) : false;
  // A SKYWARN net's reports, shown on the rows of the stations that made them.
  const [reports, setReports] = useState<SpotterReport[]>([]);
  const focusedOperator = operators.find((o) => o.id === selectedOperatorId) ?? null;

  // Net control: the activity's location, else the operator's (CIMAP-060);
  // the repeater it runs on is kept apart from it (RPT-021).
  const netControl = netControlPoint(focusedActivity, focusedOperator);
  const repeater = repeaterPoint(focusedActivity);
  // On a repeater, how far a station is from net control says little: the
  // signal goes through the repeater, so measure from it (RPT-031).
  const distanceFrom = repeater ?? netControl;

  function refreshCheckins() {
    if (!selectedActivityId) return Promise.resolve();
    return api
      .listCheckins(selectedActivityId)
      .then(setCheckins)
      .catch(() => setCheckins([]));
  }

  useEffect(() => {
    if (selectedActivityId) {
      api
        .listCheckins(selectedActivityId)
        .then(setCheckins)
        .catch(() => setCheckins([]));
    } else {
      setCheckins([]);
    }
  }, [selectedActivityId]);

  useEffect(() => {
    if (selectedActivityId && skywarn) {
      api
        .listSpotterReports(selectedActivityId)
        .then(setReports)
        .catch(() => setReports([]));
    } else {
      setReports([]);
    }
  }, [selectedActivityId, skywarn]);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => setQrzConfigured(Boolean(s.qrz_username && s.qrz_password)))
      .catch(() => setQrzConfigured(false));
    api
      .callsignPackStatus("amateur")
      .then((s) => setOfflineCallsAvailable(s.installed))
      .catch(() => setOfflineCallsAvailable(false));
    Promise.all([
      api.getSettings().catch(() => null),
      api.callsignPackStatus("amateur").catch(() => null),
      api.callsignPackStatus("gmrs").catch(() => null),
    ]).then(([s, ham, gmrs]) =>
      setCanLookUp(Boolean((s?.qrz_username && s.qrz_password) || ham?.installed || gmrs?.installed))
    );
  }, []);

  // A new entry just appears in the roster; it isn't selected (highlighted),
  // so the next entry starts clean. Click a row to select it.
  function handleCheckinSaved() {
    return refreshCheckins();
  }

  return (
    <div className="checkin-workspace">
      <div className="checkin-context-bar">
        {focusedActivity && (
          <strong className="checkin-context-activity">{focusedActivity.title}</strong>
        )}
        {focusedActivity?.frequency && (
          <span className="checkin-context-frequency">Frequency: {focusedActivity.frequency}</span>
        )}
        {repeater && (
          <span className="checkin-context-frequency">
            Repeater: {focusedActivity?.repeater_name && `${focusedActivity.repeater_name} — `}
            {formatCoordsWithGrid(repeater.lat, repeater.lon)}
          </span>
        )}
        {focusedActivity?.location_lat != null && focusedActivity.location_lon != null && (
          <span className="checkin-context-frequency">
            Net control: {focusedActivity.location_label && `${focusedActivity.location_label} — `}
            {formatCoordsWithGrid(focusedActivity.location_lat, focusedActivity.location_lon)}
          </span>
        )}
        {!relay && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rapidEntryMode}
              onChange={(e) => setRapidEntryMode(e.target.checked)}
            />
            Rapid-entry mode (keep focus)
          </label>
        )}
      </div>

      {!focusedActivity && (
        <p className="checkin-empty-state">
          Choose an activity in the top bar (or create one on the Operations tab) to begin recording
          check-ins or contacts.
        </p>
      )}

      {focusedActivity && (
        <NotStartedBanner activity={focusedActivity} />
      )}

      {focusedActivity && rangeCheck && !repeater && !closed && (
        <p className="weather-area-error" role="alert">
          Set this range check's repeater (Operations tab → Edit) before taking check-ins.
        </p>
      )}

      {focusedActivity && !relay && !closed && canLookUp === false && (
        <p className="closeout-warning">
          Call signs won't fill in names and locations yet.{" "}
          <button className="link-button" onClick={onOpenCallsignDirectories}>
            Download the FCC call-sign directory
          </button>{" "}
          (works offline), or add a QRZ.com login in Settings.
        </p>
      )}

      {focusedActivity && relay && (
        <>
          {closed && (
            <ClosedBanner title={focusedActivity.title} still="Messages can still be marked passed or not passed" />
          )}
          <RelayWorkspace activity={focusedActivity} operatorId={selectedOperatorId} readOnly={closed} />
        </>
      )}

      {focusedActivity && !relay && (
        <>
          {closed ? (
            <ClosedBanner
              title={focusedActivity.title}
              still={`${log ? "Contacts" : "Check-ins"} can still be corrected: select one to edit it, fix its location${log ? "" : ", or mark traffic handled"}`}
            />
          ) : (
            <CheckinEntryForm
              activityId={focusedActivity.id}
              operatorId={selectedOperatorId}
              qrzConfigured={qrzConfigured}
              offlineCallsAvailable={offlineCallsAvailable}
              rapidEntryMode={rapidEntryMode}
              focusCallSignSignal={focusCallSignSignal}
              onSaved={handleCheckinSaved}
              log={log}
              activityFrequency={focusedActivity.frequency}
              rangeCheck={rangeCheck}
              repeater={repeater}
            />
          )}

          <CheckinRoster
            activity={focusedActivity}
            operatorId={selectedOperatorId}
            onOpenExports={onOpenExports}
            checkins={checkins}
            readOnly={closed}
            qrzConfigured={qrzConfigured}
            offlineCallsAvailable={offlineCallsAvailable}
            selectedCheckinId={selectedCheckinId}
            onSelectCheckin={onSelectCheckin}
            onCheckinsChanged={refreshCheckins}
            onShowMap={() => setShowMap(true)}
            log={log}
            rangeCheck={rangeCheck}
            distanceFrom={distanceFrom}
            reportsByCheckin={skywarn ? hazardsByCheckin(reports) : undefined}
            onReport={(c) => onTakeReport(c.id)}
          />
        </>
      )}

      {showMap && (
        <CheckinLocationMap
          checkins={checkins}
          netControl={netControl}
          repeater={repeater}
          rangeCheck={rangeCheck}
          onClose={() => setShowMap(false)}
        />
      )}
    </div>
  );
}
