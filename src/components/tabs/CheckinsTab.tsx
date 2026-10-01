import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, Checkin, Operator } from "../../types";
import { formatCoordsWithGrid } from "../../geo";
import CheckinLocationMap from "../CheckinLocationMap";
import CheckinEntryForm from "../checkins/CheckinEntryForm";
import CheckinRoster from "../checkins/CheckinRoster";
import ClosedBanner from "../lifecycle/ClosedBanner";
import { isLog } from "../../activityTypes";

interface Props {
  activities: Activity[];
  operators: Operator[];
  selectedActivityId: string | null;
  selectedOperatorId: string | null;
  selectedCheckinId: string | null;
  onSelectCheckin: (id: string | null) => void;
  focusCallSignSignal: number;
  onOpenExports: () => void;
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
}: Props) {
  const [rapidEntryMode, setRapidEntryMode] = useState(true);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [qrzConfigured, setQrzConfigured] = useState(false);
  const [offlineCallsAvailable, setOfflineCallsAvailable] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const focusedActivity = activities.find((a) => a.id === selectedActivityId) ?? null;
  const closed = focusedActivity?.state === "closed";
  const log = focusedActivity ? isLog(focusedActivity.activity_type) : false;
  const focusedOperator = operators.find((o) => o.id === selectedOperatorId) ?? null;

  // A per-activity location (e.g. a field site) takes precedence over the
  // operator's own default location for the check-in map's reference point
  // (CIMAP-060), since an operator may run a given activity from somewhere
  // other than their usual QTH.
  const mapReferenceLocation =
    focusedActivity?.location_lat != null && focusedActivity?.location_lon != null
      ? {
          lat: focusedActivity.location_lat,
          lon: focusedActivity.location_lon,
          label: focusedActivity.location_label || focusedActivity.title,
        }
      : focusedOperator?.location_lat != null && focusedOperator?.location_lon != null
        ? {
            lat: focusedOperator.location_lat,
            lon: focusedOperator.location_lon,
            label: focusedOperator.location_label || focusedOperator.display_name,
          }
        : null;

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
    api
      .getSettings()
      .then((s) => setQrzConfigured(Boolean(s.qrz_username && s.qrz_password)))
      .catch(() => setQrzConfigured(false));
    api
      .callsignPackStatus("amateur")
      .then((s) => setOfflineCallsAvailable(s.installed))
      .catch(() => setOfflineCallsAvailable(false));
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
        {focusedActivity?.location_lat != null && focusedActivity.location_lon != null && (
          <span className="checkin-context-frequency">
            Location: {focusedActivity.location_label && `${focusedActivity.location_label} — `}
            {formatCoordsWithGrid(focusedActivity.location_lat, focusedActivity.location_lon)}
          </span>
        )}
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={rapidEntryMode}
            onChange={(e) => setRapidEntryMode(e.target.checked)}
          />
          Rapid-entry mode (keep focus)
        </label>
      </div>

      {!focusedActivity && (
        <p className="checkin-empty-state">
          Choose an activity in the top bar (or create one on the Operations tab) to begin recording
          check-ins or contacts.
        </p>
      )}

      {focusedActivity && (
        <>
          {closed ? (
            <ClosedBanner title={focusedActivity.title} />
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
          />
        </>
      )}

      {showMap && (
        <CheckinLocationMap
          checkins={checkins}
          operatorLat={mapReferenceLocation?.lat ?? null}
          operatorLon={mapReferenceLocation?.lon ?? null}
          operatorLabel={mapReferenceLocation?.label ?? ""}
          onClose={() => setShowMap(false)}
        />
      )}
    </div>
  );
}
