import { useEffect, useRef, useState } from "react";
import * as api from "../../api";
import type { Activity, EventRecord, Operator, Repeater } from "../../types";
import type { ActivityPrefill } from "./activityPrefill";
import ActivityForm, { type ActivityDraft, type ActivityPlace } from "./ActivityForm";
import { DEFAULT_ACTIVITY_TYPE, isLog, isRangeCheck } from "../../activityTypes";
import { combineScheduledAt, todayIso } from "../../utils";
import { CirclePlus } from "lucide-react";

interface Props {
  activities: Activity[];
  onActivitiesChanged: () => void;
  onSelectActivity: (id: string) => void;
  operators: Operator[];
  /** The default operator, who runs a new activity unless another is chosen. */
  selectedOperatorId: string | null;
  /** The repeater directory, to pick from. */
  repeaters: Repeater[];
  /** The events there are, to put the new activity in one. */
  events?: EventRecord[];
  /** Values to fill the form with, e.g. from a net listing (NETL-030). */
  prefill?: ActivityPrefill | null;
  onPrefillHandled?: () => void;
  /** Open the form, from the "+ New activity" button or the top bar. */
  openRequested?: boolean;
  onOpenHandled?: () => void;
}

const blank = (operatorId: string | null): ActivityDraft => ({
  title: "",
  type: DEFAULT_ACTIVITY_TYPE,
  operatorId: operatorId ?? "",
  date: todayIso(),
  time: "",
  frequency: "",
  repeater: null,
  location: null,
  started: "",
  ended: "",
  eventId: "",
});

/** An operator's own location, if they have one. */
export function operatorPlace(o: Operator | null | undefined): ActivityPlace | null {
  return o?.location_lat != null && o.location_lon != null
    ? { label: o.location_label || o.display_name, lat: o.location_lat, lon: o.location_lon }
    : null;
}

export default function CreateActivityPanel({
  activities,
  onActivitiesChanged,
  onSelectActivity,
  operators,
  selectedOperatorId,
  repeaters,
  events = [],
  prefill = null,
  onPrefillHandled,
  openRequested = false,
  onOpenHandled,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const hasActivities = activities.length > 0;
  // Out of the way once activities exist, opened with "+ New activity"; always
  // open for a brand-new setup, where it's the obvious next step.
  const [collapsed, setCollapsed] = useState(true);
  const expanded = hasActivities ? !collapsed : true;
  const [draft, setDraft] = useState<ActivityDraft>(() => blank(selectedOperatorId));
  const change = (patch: Partial<ActivityDraft>) => setDraft((d) => ({ ...d, ...patch }));
  // Run by the default operator unless another was chosen.
  const operatorId = draft.operatorId || selectedOperatorId || "";

  function focusForm() {
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      panelRef.current
        ?.querySelector<HTMLInputElement>('input[placeholder="Activity title"]')
        ?.focus();
    });
  }

  useEffect(() => {
    if (!openRequested) return;
    setCollapsed(false);
    onOpenHandled?.();
    focusForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequested]);

  // Opens the form, fills it from a net listing, and brings it into view.
  // Nothing is created until Create (NETL-031).
  useEffect(() => {
    if (!prefill) return;
    setCollapsed(false);
    change({
      title: prefill.title,
      type: prefill.activityType,
      date: prefill.date,
      time: prefill.time,
      frequency: prefill.frequency,
      repeater: prefill.repeater,
      eventId: prefill.eventId ?? "",
    });
    onPrefillHandled?.();
    focusForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const operatorLocation = operatorPlace(operators.find((o) => o.id === operatorId));

  // Discards whatever was typed and closes the form (it stays open only when
  // there are no activities yet, where it's the first step).
  function handleCancel() {
    setDraft(blank(selectedOperatorId));
    setCollapsed(true);
  }

  async function handleAddActivity() {
    if (!draft.title.trim() || (isRangeCheck(draft.type) && !draft.repeater)) return;
    const id = await api.createActivity(
      draft.title.trim(),
      draft.type,
      // A station log is ongoing: it has no date.
      isLog(draft.type) ? null : combineScheduledAt(draft.date, draft.time) || null,
      draft.frequency.trim() || null,
      operatorId || null
    );
    if (!isLog(draft.type) && draft.eventId) {
      await api.setActivityEvent(id, draft.eventId, operatorId || null).catch(() => {});
    }
    const where = draft.location ?? operatorLocation;
    if (where) {
      // The activity exists either way; a failed location just leaves it unset.
      await api.setActivityLocationCoords(id, where.lat, where.lon, where.label || null).catch(() => {});
    }
    if (draft.repeater) {
      // Likewise; a range check without one is refused check-ins until it's set.
      const r = draft.repeater;
      await api.setActivityRepeater(id, r.name || null, r.lat, r.lon).catch(() => {});
    }
    onActivitiesChanged();
    onSelectActivity(id);
    handleCancel();
  }

  if (!expanded) return null;

  return (
    <div className="panel" ref={panelRef}>
      <h3>
        <CirclePlus className="heading-icon" />
        New Activity
      </h3>
      <ActivityForm
        draft={{ ...draft, operatorId }}
        onChange={change}
        operators={operators}
        repeaters={repeaters}
        operatorLocation={operatorLocation}
        submitLabel="Create activity"
        onSubmit={handleAddActivity}
        onCancel={hasActivities ? handleCancel : undefined}
        mapTitle="new activity"
        events={events}
      />
    </div>
  );
}
