import { useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, ActivitySummary, Checkin, Operator } from "../../types";
import CheckinLocationMap from "../CheckinLocationMap";
import { netControlPoint, repeaterPoint } from "../../mapPoints";
import { isRangeCheck } from "../../activityTypes";
import { SummaryView } from "../exports/SummaryView";
import { summaryFacts } from "../../summaryFacts";
import { useWeatherRecorded } from "../../netWeather";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * The selected activity's summary, laid out like the end-of-net step
 * (EXPORT-017). Viewing or saving it as text is in Exports & forms.
 */
export default function ActivitySummaryPanel({
  activity,
  operator,
}: {
  activity: Activity;
  /** The operator at the console, whose location stands in for net control's when the activity has none. */
  operator: Operator | null;
}) {
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  // The check-ins shown on the map, once it's opened; null while it's closed.
  const [mapCheckins, setMapCheckins] = useState<Checkin[] | null>(null);
  // Folded to one line by default, so the page isn't mostly summary; the same
  // summary is in the End net window and in Exports & forms.
  const [open, setOpen] = useState(false);

  const load = () =>
    api
      .activitySummary(activity.id)
      .then(setSummary)
      .catch(() => setSummary(null));
  // The activity object changes whenever its state does, which is when the numbers matter most.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity]);
  // The weather comes in a moment after a net starts or ends.
  useWeatherRecorded(activity.id, load);

  // The same map as the Check-ins tab's Show map.
  const showMap = () =>
    api
      .listCheckins(activity.id)
      .then(setMapCheckins)
      .catch(() => setMapCheckins([]));

  if (!summary) return null;
  return (
    <div className="location-subpanel">
      <div className="summary-header">
        <button className="summary-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? <ChevronDown className="summary-toggle-icon" /> : <ChevronRight className="summary-toggle-icon" />}
          <h4>Summary</h4>
          {!open && (
            <span className="settings-hint">
              {summaryFacts(activity.activity_type, summary)
                .map((f) => f.text)
                .join(" · ")}
            </span>
          )}
        </button>
        {summary.checkins > 0 && <button onClick={showMap}>Show map</button>}
      </div>
      {open && <SummaryView activity={activity} summary={summary} notes={summary.conclusion.trim()} />}
      {mapCheckins && (
        <CheckinLocationMap
          checkins={mapCheckins}
          netControl={netControlPoint(activity, operator)}
          repeater={repeaterPoint(activity)}
          rangeCheck={isRangeCheck(activity.activity_type)}
          onClose={() => setMapCheckins(null)}
        />
      )}
    </div>
  );
}
