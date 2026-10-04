import { Fragment, useEffect, useState } from "react";
import * as api from "../../api";
import type { Activity, SpotterReport } from "../../types";
import { WIND_DAMAGE_GUIDE } from "../../types";
import { formatCoords } from "../../geo";
import { latLonToGridSquare } from "../../grid";
import { RemoveConfirmBar, RemovedPanel } from "../RemoveControls";
import IcsFormDialog from "../exports/IcsFormDialog";
import { ics213FromReport, type GeneralMessage213Input } from "../../icsForms";
import { useVoidableList } from "../../hooks/useVoidableList";
import SpotterReportMap from "./SpotterReportMap";
import { Tornado } from "lucide-react";
import SortToggle from "../SortToggle";
import { sortByTime, useSortOrder } from "../../hooks/useSortOrder";

interface Props {
  activity: Activity;
  operatorId: string | null;
  reports: SpotterReport[];
  readOnly?: boolean;
  /** Goes to the Exports tab. */
  onOpenExports: () => void;
  /** Who is logging, for the printable ICS forms. */
  operatorName?: string;
  operatorCall?: string;
  selectedReportId: string | null;
  editingReportId: string | null;
  onSelectReport: (id: string | null) => void;
  onEdit: (id: string) => void;
  onReportsChanged: () => void;
}

/** Splits the stored "YYYY-MM-DDTHH:mm" value (our own datetime-local format) into separate date/time display strings. */
function reportDateTimeParts(reportedAt: string): {
  date: string;
  time: string;
} {
  const [date, time] = reportedAt.split("T");
  return { date: date ?? reportedAt, time: time ?? "" };
}

/** For a wind report saved from the standard magnitude list, surfaces its damage-indicator description as hover detail in the roster. */
function magnitudeTitle(hazardType: string, magnitude: string): string | undefined {
  if (hazardType === "Wind Damage") {
    const entry = WIND_DAMAGE_GUIDE.find((g) => magnitude.startsWith(g.range));
    if (entry) return entry.description;
  }
  return magnitude || undefined;
}

/** The spotter reports list: roster, remove/restore, and the removed-reports panel. */
export default function SpotterReportRoster({
  activity,
  operatorId,
  reports,
  readOnly = false,
  onOpenExports,
  operatorName = "",
  operatorCall = "",
  selectedReportId,
  editingReportId,
  onSelectReport,
  onEdit,
  onReportsChanged,
}: Props) {
  const [showMap, setShowMap] = useState(false);
  const [icsDialog, setIcsDialog] = useState<
    null | { form: "309" } | { form: "213"; initial: GeneralMessage213Input }
  >(null);
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());

  const [order, toggleOrder] = useSortOrder("spotter-reports", "newest");
  const sortedReports = sortByTime(reports, (r) => r.reported_at, order);
  const selectedReport = reports.find((r) => r.id === selectedReportId) ?? null;

  const removal = useVoidableList<SpotterReport>({
    scopeKey: activity.id,
    listVoided: () => api.listVoidedSpotterReports(activity.id),
    voidItem: (id, reason) => api.voidSpotterReport(id, reason, operatorId),
    restoreItem: (id) => api.restoreSpotterReport(id, operatorId),
    onChanged: onReportsChanged,
    onRemoved: (id) => {
      if (selectedReportId === id) onSelectReport(null);
    },
  });
  const removingId = removal.removingId;

  useEffect(() => {
    setShowMap(false);
    setOpenNotes(new Set());
  }, [activity.id]);

  function toggleNotes(id: string) {
    setOpenNotes((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="checkin-roster-panel">
        <div className="checkin-roster-header">
          <h3><Tornado className="heading-icon" />Spotter Reports — {activity.title}</h3>
          <div className="checkin-roster-header-actions">
            <span className="checkin-roster-count">{reports.length} logged</span>
            <SortToggle order={order} onToggle={toggleOrder} />
            <button onClick={() => setShowMap(true)} disabled={reports.length === 0}>
              Show Map
            </button>
            <button
              className="link-button"
              onClick={onOpenExports}
              title="Export the reports, forms, and more"
            >
              Exports…
            </button>
            <button className="link-button" onClick={removal.toggleShowRemoved}>
              {removal.showRemoved ? "Hide removed" : "Show removed"}
            </button>
          </div>
        </div>
        {reports.length > 0 && (
          <div className="report-row report-row-columns">
            <span>Reporter</span>
            <span>Source</span>
            <span>Date</span>
            <span>Time</span>
            <span>Type</span>
            <span>Magnitude</span>
            <span>Intersection</span>
            <span>County</span>
            <span>Coordinates</span>
            <span>Grid Square</span>
            <span>Notes</span>
          </div>
        )}
        <div className="checkin-roster">
          {reports.length === 0 && (
            <p className="checkin-empty-state">No spotter reports logged yet.</p>
          )}
          {sortedReports.map((r) => {
            const { date, time } = reportDateTimeParts(r.reported_at);
            const hasCoords = r.lat != null && r.lon != null;
            const coordsDisplay = hasCoords ? formatCoords(r.lat as number, r.lon as number) : "—";
            const gridDisplay = hasCoords
              ? latLonToGridSquare(r.lat as number, r.lon as number)
              : "—";
            const hasNotes = r.notes.trim() !== "";
            const notesOpen = openNotes.has(r.id);
            return (
              <Fragment key={r.id}>
                <div
                  className={"report-row" + (selectedReportId === r.id ? " selected" : "")}
                  onClick={() => onSelectReport(r.id)}
                >
                  <span className="report-row-reporter" title={r.reporter || undefined}>
                    {r.reporter || "—"}
                    {r.checkin_id && <span className="settings-hint"> (linked)</span>}
                  </span>
                  <span className="report-row-source" title={r.source || undefined}>
                    {r.source || "—"}
                  </span>
                  <span className="report-row-date">{date}</span>
                  <span className="report-row-time">{time}</span>
                  <span className="report-row-type">{r.hazard_type}</span>
                  <span
                    className="report-row-magnitude"
                    title={magnitudeTitle(r.hazard_type, r.magnitude)}
                  >
                    {r.magnitude || "—"}
                  </span>
                  <span className="report-row-intersection" title={r.location_text || undefined}>
                    {r.location_text || "—"}
                  </span>
                  <span className="report-row-county" title={r.county || undefined}>
                    {r.county || "—"}
                  </span>
                  <span className="report-row-coords" title={hasCoords ? coordsDisplay : undefined}>
                    {coordsDisplay}
                  </span>
                  <span className="report-row-grid">{gridDisplay}</span>
                  <span className="report-row-notes">
                    {hasNotes && (
                      <button
                        className="link-button"
                        aria-expanded={notesOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNotes(r.id);
                        }}
                      >
                        {notesOpen ? "Hide notes" : "Show notes"}
                      </button>
                    )}
                  </span>
                </div>
                {hasNotes && notesOpen && (
                  <div className="report-notes-detail">
                    <span className="report-notes-label">Notes:</span> {r.notes}
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

        {readOnly && selectedReport && (
          <div className="inline-form checkin-roster-actions">
            <button
              onClick={() =>
                setIcsDialog({
                  form: "213",
                  initial: ics213FromReport(activity, selectedReport, operatorName),
                })
              }
            >
              ICS-213 (this report)
            </button>
          </div>
        )}
        {!readOnly && selectedReport && removingId !== selectedReport.id && !editingReportId && (
          <div className="inline-form checkin-roster-actions">
            <button onClick={() => onEdit(selectedReport.id)}>Edit</button>
            <button onClick={() => removal.startRemove(selectedReport.id)}>Remove</button>
            <button
              onClick={() =>
                setIcsDialog({
                  form: "213",
                  initial: ics213FromReport(activity, selectedReport, operatorName),
                })
              }
              title="A printable ICS-213 General Message for this report"
            >
              ICS-213 (this report)
            </button>
            <button onClick={() => onSelectReport(null)}>Clear selection</button>
          </div>
        )}

        {removingId && (
          <RemoveConfirmBar
            question="Remove this spotter report?"
            reason={removal.reason}
            onReasonChange={removal.setReason}
            onConfirm={removal.confirmRemove}
            onCancel={removal.cancelRemove}
          />
        )}
      </div>

      {icsDialog && (
        <IcsFormDialog
          {...icsDialog}
          activity={activity}
          operatorName={operatorName}
          operatorCall={operatorCall}
          onClose={() => setIcsDialog(null)}
        />
      )}

      {showMap && (
        <SpotterReportMap
          reports={reports}
          selectedReportId={selectedReportId}
          onClose={() => setShowMap(false)}
        />
      )}

      {removal.showRemoved && (
        <RemovedPanel
          title="Removed spotter reports"
          emptyText="No removed spotter reports."
          items={removal.voided}
          renderItem={(r) => (
            <span>
              {r.hazard_type} — {r.location_text}
            </span>
          )}
          onRestore={removal.restore}
        />
      )}
    </>
  );
}
