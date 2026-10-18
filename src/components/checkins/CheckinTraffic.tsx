import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Checkin, RelayMessage, RelayStep, RelayStepKind } from "../../types";
import { HeldActions, MessageCard, StepForm } from "../relay/RelaySteps";

/**
 * A selected check-in's traffic (RELAY-051): what's been done to pass it on,
 * and the way to record more — passed to whom and how, a failed attempt, or
 * couldn't pass. Ticking Handled on the row stays the quick way.
 */
export default function CheckinTraffic({
  checkin,
  message,
  stationChoices,
  viaChoices,
  operatorId,
  onChanged,
}: {
  checkin: Checkin;
  message: RelayMessage;
  stationChoices: string[];
  viaChoices: string[];
  operatorId: string | null;
  onChanged: () => void;
}) {
  const [kind, setKind] = useState<RelayStepKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setKind(null);
    setError(null);
  }, [checkin.id]);

  async function undo(s: RelayStep) {
    try {
      await api.undoRelayStep(s.id, operatorId);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
    onChanged();
  }

  return (
    <MessageCard
      message={message}
      className="checkin-traffic"
      title={
        <span>
          Traffic from <strong>{checkin.call_sign}</strong>
        </span>
      }
      empty={<em>No details yet — Edit to add them.</em>}
      onUndo={undo}
    >
      {message.status === "held" && !kind && (
        <div className="inline-form relay-actions">
          <HeldActions onStep={setKind} />
        </div>
      )}
      {kind && (
        <StepForm
          key={kind}
          message={message}
          kind={kind}
          stationChoices={stationChoices}
          viaChoices={viaChoices}
          operatorId={operatorId}
          onSaved={() => {
            setKind(null);
            onChanged();
          }}
          onCancel={() => setKind(null)}
        />
      )}
      {error && (
        <p className="weather-area-error" role="alert">
          {error}
        </p>
      )}
    </MessageCard>
  );
}
