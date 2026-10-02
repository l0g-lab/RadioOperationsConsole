import { useEffect, useState, type ReactNode } from "react";
import * as api from "../../api";
import type {
  Activity,
  ActivitySummary,
  Checkin,
  HistoryEvent,
  Operator,
  SpotterReport,
} from "../../types";
import {
  activityPackageToJson,
  activitySummaryToText,
  checkinsToCsv,
  checkinsToJson,
  exportFilename,
  historyToCsv,
  saveTextFile,
  spotterReportsToCsv,
  spotterReportsToJson,
  spotterReportsToText,
} from "../../export";
import { ics213FromReport, ics213FromReports, type GeneralMessage213Input } from "../../icsForms";
import IcsFormDialog from "./IcsFormDialog";
import { SummaryTextDialog } from "./SummaryDialog";

/**
 * `unavailable` is the reason there's nothing to do. The button stays clickable,
 * dimmed, and clicking it says why — a greyed-out button can't explain itself.
 */
type Action = {
  label: string;
  onClick: () => void;
  unavailable?: string;
  title?: string;
};

function Row({
  title,
  count,
  note,
  actions,
  notify,
  children,
}: {
  title: string;
  count?: string;
  note?: string;
  actions: Action[];
  notify: (text: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="export-row">
      <div className="export-row-info">
        <strong>{title}</strong>
        {count && <span className="settings-hint"> {count}</span>}
        {note && <div className="settings-hint">{note}</div>}
      </div>
      <div className="inline-form">
        {actions.map((a) => (
          <button
            key={a.label}
            className={a.unavailable ? "export-unavailable" : undefined}
            aria-disabled={a.unavailable ? true : undefined}
            onClick={a.unavailable ? () => notify(a.unavailable as string) : a.onClick}
            title={a.title}
          >
            {a.label}
          </button>
        ))}
        {children}
      </div>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Every export for one activity, in one list: the records as CSV or JSON, the
 * log and history, the summary, everything as a single package, and the ICS
 * forms. Used by the Exports tab and by the end-of-net step, so they always
 * offer the same things. Files are saved where the operator chooses and nothing
 * needs a network.
 */
export default function ExportOptions({
  activity,
  operator,
  conclusion,
}: {
  activity: Activity;
  operator: Operator | null;
  /** Closing notes being written in the end-of-net step, used in the summary before they're saved. */
  conclusion?: string;
}) {
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [reports, setReports] = useState<SpotterReport[]>([]);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
    info?: boolean;
  } | null>(null);
  const [ics, setIcs] = useState<
    null | { form: "309" } | { form: "213"; initial: GeneralMessage213Input }
  >(null);
  const [reportId, setReportId] = useState("");
  const [showingSummary, setShowingSummary] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMessage(null);
    Promise.all([
      api.listCheckins(activity.id).catch(() => [] as Checkin[]),
      api.listSpotterReports(activity.id).catch(() => [] as SpotterReport[]),
      api.activityHistory(activity.id).catch(() => [] as HistoryEvent[]),
      api.activitySummary(activity.id).catch(() => null),
    ]).then(([c, r, h, s]) => {
      if (cancelled) return;
      setCheckins(c);
      setReports(r);
      setHistory(h);
      setSummary(s);
      setReportId((cur) => (r.some((x) => x.id === cur) ? cur : (r[0]?.id ?? "")));
    });
    return () => {
      cancelled = true;
    };
  }, [activity.id, activity.state, activity.closed_at]);

  const operatorName = operator?.display_name ?? "";
  const operatorCall = operator?.call_sign ?? "";

  async function save(name: string, content: string, what: string) {
    try {
      const path = await saveTextFile(name, content);
      if (path) setMessage({ text: `Saved ${what} to ${path}`, error: false });
    } catch (e) {
      setMessage({ text: `Couldn't save: ${e}`, error: true });
    }
  }

  const notify = (text: string) => setMessage({ text, error: false, info: true });

  const noCheckins = checkins.length === 0;
  const noReports = reports.length === 0;
  const chosenReport = reports.find((r) => r.id === reportId);

  return (
    <div className="export-list">
      <section className="export-section">
        <h4 className="export-section-title">Records and reports</h4>
        <p className="settings-hint">
          The activity's own data, as spreadsheets and files, or in one package.
        </p>
        <Row
          notify={notify}
          title="Check-ins"
          count={plural(checkins.length, "record", "records")}
          note="Everything the roster shows, with coordinates, traffic, and local and UTC times."
          actions={[
            {
              label: "CSV",
              unavailable: noCheckins
                ? "There are no check-ins yet, so there's nothing to export."
                : undefined,
              onClick: () =>
                save(
                  exportFilename(activity, "Check-ins", "csv"),
                  checkinsToCsv(checkins),
                  "the check-ins"
                ),
            },
            {
              label: "JSON",
              unavailable: noCheckins
                ? "There are no check-ins yet, so there's nothing to export."
                : undefined,
              onClick: () =>
                save(
                  exportFilename(activity, "Check-ins", "json"),
                  checkinsToJson(activity, checkins),
                  "the check-ins"
                ),
            },
          ]}
        />
        <Row
          notify={notify}
          title="Spotter reports"
          count={plural(reports.length, "report", "reports")}
          actions={[
            {
              label: "CSV",
              unavailable: noReports
                ? "There are no spotter reports yet, so there's nothing to export."
                : undefined,
              onClick: () =>
                save(
                  exportFilename(activity, "Spotter reports", "csv"),
                  spotterReportsToCsv(reports),
                  "the reports"
                ),
            },
            {
              label: "JSON",
              unavailable: noReports
                ? "There are no spotter reports yet, so there's nothing to export."
                : undefined,
              onClick: () =>
                save(
                  exportFilename(activity, "Spotter reports", "json"),
                  spotterReportsToJson(activity, reports),
                  "the reports"
                ),
            },
            {
              label: "Text report",
              unavailable: noReports
                ? "There are no spotter reports yet, so there's nothing to export."
                : undefined,
              title: "Readable, for pasting into an email or message",
              onClick: () =>
                save(
                  exportFilename(activity, "Spotter reports", "txt"),
                  spotterReportsToText(activity, reports),
                  "the report"
                ),
            },
          ]}
        />
        <Row
          notify={notify}
          title="Full history"
          count={plural(history.length, "event", "events")}
          note="Every start, close, correction, removal and restore, with the operator and time."
          actions={[
            {
              label: "CSV",
              unavailable:
                history.length === 0
                  ? "Nothing has been recorded for this activity yet."
                  : undefined,
              onClick: () =>
                save(
                  exportFilename(activity, "History", "csv"),
                  historyToCsv(history),
                  "the history"
                ),
            },
          ]}
        />
        <Row
          notify={notify}
          title="Net summary"
          note="Times, counts by the activity's type, and the closing notes."
          actions={[
            {
              label: "Show summary text",
              title: "See exactly what the text file will hold, before saving it",
              onClick: () => setShowingSummary(true),
            },
            {
              label: "Text",
              unavailable: !summary
                ? "The summary hasn't loaded yet. Try again in a moment."
                : undefined,
              onClick: () =>
                summary &&
                save(
                  exportFilename(activity, "Summary", "txt"),
                  activitySummaryToText(activity, {
                    ...summary,
                    conclusion: (conclusion ?? summary.conclusion).trim(),
                  }),
                  "the summary"
                ),
            },
          ]}
        />
        <Row
          notify={notify}
          title="Everything for this activity"
          note="One JSON file: the activity, summary, check-ins, reports, and history."
          actions={[
            {
              label: "JSON package",
              unavailable: !summary
                ? "The summary hasn't loaded yet. Try again in a moment."
                : undefined,
              onClick: () =>
                save(
                  exportFilename(activity, "Package", "json"),
                  activityPackageToJson(activity, summary, checkins, reports, history),
                  "the package"
                ),
            },
          ]}
        />
      </section>

      <section className="export-section">
        <h4 className="export-section-title">ICS forms</h4>
        <p className="settings-hint">
          Standard forms for agencies, each ready to load into Winlink Express or print.
        </p>
        <Row
          notify={notify}
          title="ICS 309 — Communications Log"
          count="from the check-in list"
          note="For Winlink Express's Form-309, or printable."
          actions={[
            {
              label: "Open…",
              unavailable: noCheckins
                ? "There are no check-ins yet, so there's nothing to export."
                : undefined,
              onClick: () => setIcs({ form: "309" }),
            },
          ]}
        />
        <Row
          notify={notify}
          title="ICS 213 — General Message"
          count="from the spotter reports"
          note="For Winlink Express, or printable."
          actions={[
            {
              label: "All reports…",
              unavailable: noReports
                ? "The ICS 213 is built from spotter reports, and this activity has none yet."
                : undefined,
              onClick: () =>
                setIcs({
                  form: "213",
                  initial: ics213FromReports(activity, reports, operatorName),
                }),
            },
          ]}
        >
          {!noReports && (
            <>
              <select
                value={reportId}
                onChange={(e) => setReportId(e.target.value)}
                aria-label="Report for a single ICS 213"
              >
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {[r.reported_at.replace("T", " "), r.hazard_type, r.reporter]
                      .filter(Boolean)
                      .join(" — ")}
                  </option>
                ))}
              </select>
              <button
                disabled={!chosenReport}
                onClick={() =>
                  chosenReport &&
                  setIcs({
                    form: "213",
                    initial: ics213FromReport(activity, chosenReport, operatorName),
                  })
                }
              >
                This report…
              </button>
            </>
          )}
        </Row>
      </section>

      {message && (
        <p
          className={
            message.info
              ? "closeout-warning"
              : message.error
                ? "weather-area-error"
                : "qrz-status qrz-status-found"
          }
          role="status"
        >
          {message.text}
        </p>
      )}

      {showingSummary && (
        <SummaryTextDialog
          activity={activity}
          conclusion={conclusion}
          onClose={() => setShowingSummary(false)}
        />
      )}
      {ics && (
        <IcsFormDialog
          {...ics}
          activity={activity}
          operatorName={operatorName}
          operatorCall={operatorCall}
          onClose={() => setIcs(null)}
        />
      )}
    </div>
  );
}
