import { useEffect, useMemo, useState } from "react";
import { eventSpan } from "../../events";
import * as api from "../../api";
import type { Activity, Ics214Details, Ics214Line, Ics214Log, Operator } from "../../types";
import { saveFilesToFolder, saveTextFile } from "../../export";
import { localDateTime } from "../../icsForms";
import { parseContactTime } from "../../utils";
import {
  activitiesInPeriod,
  form214LoadFile,
  form214Message,
  form214Pages,
  form214PasteLines,
  form214Xml,
  generateLines,
  ICS214_LOG_ROWS,
  ICS214_RESOURCE_ROWS,
  ICS214_WINLINK_FILENAME,
  ics214Html,
  mergeLines,
  resourcesFromRecords,
  sortLines,
  type ActivityRecords,
} from "../../ics214";
import { useEscape } from "./SummaryView";
import { ClipboardList } from "lucide-react";

/** A safe file name from free text. */
const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Activity log";

/** Loads what the records hold for these activities, to fill the log from. */
async function loadRecords(activities: Activity[]): Promise<ActivityRecords[]> {
  return Promise.all(
    activities.map(async (activity) => {
      const [summary, checkins, history, reports, relay] = await Promise.all([
        api.activitySummary(activity.id).catch(() => null),
        api.listCheckins(activity.id).catch(() => []),
        api.activityHistory(activity.id).catch(() => []),
        api.listSpotterReports(activity.id).catch(() => []),
        api.listRelayMessages(activity.id).catch(() => []),
      ]);
      return { activity, summary, checkins, history, reports, relay };
    })
  );
}

function Text({
  label,
  value,
  onChange,
  wide,
  invalid,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  wide?: boolean;
  invalid?: boolean;
  placeholder?: string;
}) {
  return (
    <label className={wide ? "ics-field ics-field-wide" : "ics-field"}>
      {label}
      <input
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** A log line being edited: its time as typed, kept until it reads as a time. */
interface DraftLine extends Ics214Line {
  timeText: string;
}

const draftLines = (lines: Ics214Line[]): DraftLine[] =>
  sortLines(lines).map((l) => ({ ...l, timeText: localDateTime(l.at) }));

/**
 * ICS 214 Activity Logs (ics-form-exports.md, ICSF-050–056): a period of
 * operation gathered from every activity in it, edited, kept, and exported
 * for Winlink's ICS 214 form or printed. Not tied to the activity in the top
 * bar, since one log usually spans several.
 */
export default function Ics214Dialog({
  operator,
  onClose,
  event,
}: {
  operator: Operator | null;
  onClose: () => void;
  /** Opens straight to this event's log: its saved one, or a new one set to it (EVT-041). */
  event?: { id: string; name: string; activities: Activity[] };
}) {
  const [logs, setLogs] = useState<Ics214Log[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; details: Ics214Details } | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const refresh = () =>
    api
      .listIcs214Logs()
      .then(setLogs)
      .catch(() => setLogs([]));
  useEffect(() => {
    refresh();
  }, []);

  // For an event: its saved log if there is one, else a new one covering it.
  const [eventOpened, setEventOpened] = useState(false);
  useEffect(() => {
    if (!event || logs == null || eventOpened) return;
    setEventOpened(true);
    const saved = logs.find((l) => l.event_id === event.id);
    if (saved) {
      setEditing({ id: saved.id, details: saved });
      return;
    }
    const span = eventSpan(event.activities) ?? {
      from: new Date(Date.now() - 3_600_000).toISOString(),
      to: new Date(Math.ceil(Date.now() / 60_000) * 60_000).toISOString(),
    };
    api
      .listActivities()
      .catch(() => [] as Activity[])
      .then((all) => {
        // Everything else that ran in the period is left out, so it's just the event.
        const others = activitiesInPeriod(all, span.from, span.to).filter((a) => a.event_id !== event.id);
        startNew({ incident: event.name, ...span, excluded: others.map((a) => a.id), eventId: event.id });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, logs]);

  function startNew(preset?: { incident: string; from: string; to: string; excluded: string[]; eventId: string }) {
    const now = new Date();
    const morning = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0);
    const last = logs?.[0];
    setEditing({
      id: null,
      details: {
        incident_name: preset?.incident ?? "",
        period_from: preset?.from ?? morning.toISOString(),
        period_to: preset?.to ?? new Date(Math.ceil(now.getTime() / 60_000) * 60_000).toISOString(),
        name: [operator?.display_name, operator?.call_sign].filter(Boolean).join(" "),
        // Usually the same as last time.
        ics_position: last?.ics_position ?? "",
        home_agency: last?.home_agency ?? "",
        prepared_name: operator?.display_name ?? "",
        resources: [],
        excluded_activities: preset?.excluded ?? [],
        event_id: preset?.eventId ?? null,
        lines: [],
        dismissed: [],
      },
    });
    setMessage(null);
  }

  async function remove(log: Ics214Log) {
    try {
      await api.deleteIcs214Log(log.id, operator?.id ?? null);
      refresh();
    } catch (e) {
      setMessage({ text: String(e), error: true });
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel lifecycle-modal ics214-modal" role="dialog" aria-label="ICS 214 Activity Log">
        {editing ? (
          <Editor
            key={editing.id ?? "new"}
            id={editing.id}
            initial={editing.details}
            isNew={editing.id == null}
            operator={operator}
            onSaved={(log) => {
              setEditing({ id: log.id, details: log });
              refresh();
            }}
            onBack={() => {
              setEditing(null);
              refresh();
            }}
          />
        ) : (
          <>
            <div className="modal-header">
              <h3>
                <ClipboardList className="heading-icon" />
                ICS 214 Activity Logs
              </h3>
              <button onClick={onClose}>Close</button>
            </div>
            <p className="settings-hint">
              An activity log covers a period of operation — say a whole SET, across every net you ran —
              filled in from the records, with anything else you add. Logs are kept, so your edits are
              there next time.
            </p>
            <div className="inline-form">
              <button onClick={() => startNew()}>New activity log</button>
            </div>
            {logs && logs.length === 0 && <p className="checkin-empty-state">No activity logs yet.</p>}
            <div className="operator-list">
              {logs?.map((l) => (
                <div key={l.id} className="operator-row">
                  <span className="repeater-row-text">
                    <strong>{l.incident_name}</strong>
                    <span className="settings-hint">
                      {localDateTime(l.period_from)} – {localDateTime(l.period_to)} · {l.lines.length} lines
                    </span>
                  </span>
                  <span className="operator-row-actions">
                    <button className="link-button" onClick={() => setEditing({ id: l.id, details: l })}>
                      Open
                    </button>
                    <button
                      className="link-button danger-link"
                      aria-label={`Delete ${l.incident_name}`}
                      onClick={() => remove(l)}
                    >
                      Delete
                    </button>
                  </span>
                </div>
              ))}
            </div>
            {message && <p className={message.error ? "weather-area-error" : "settings-hint"}>{message.text}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function Editor({
  id,
  initial,
  isNew,
  operator,
  onSaved,
  onBack,
}: {
  id: string | null;
  initial: Ics214Details;
  isNew: boolean;
  operator: Operator | null;
  onSaved: (log: Ics214Log) => void;
  onBack: () => void;
}) {
  const [d, setD] = useState<Ics214Details>(initial);
  const [fromText, setFromText] = useState(localDateTime(initial.period_from));
  const [toText, setToText] = useState(localDateTime(initial.period_to));
  const [lines, setLines] = useState<DraftLine[]>(() => draftLines(initial.lines));
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [dirty, setDirty] = useState(isNew);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const ok = (text: string) => setMessage({ text, error: false });
  const fail = (text: string) => setMessage({ text, error: true });

  const leave = () => (dirty ? setConfirmLeave(true) : onBack());
  useEscape(leave);

  useEffect(() => {
    api
      .listActivities()
      .catch(() => [])
      .then(setAllActivities);
  }, []);

  const from = parseContactTime(fromText);
  const to = parseContactTime(toText);
  const periodOk = from.kind === "ok" && to.kind === "ok" && from.iso < to.iso;
  const inPeriod = useMemo(
    () => (from.kind === "ok" && to.kind === "ok" ? activitiesInPeriod(allActivities, from.iso, to.iso) : []),
    [allActivities, fromText, toText] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const change = <K extends keyof Ics214Details>(k: K, v: Ics214Details[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  /** The details as they'd be saved, with line times read from what was typed. */
  function current(): Ics214Details | string {
    if (!d.incident_name.trim()) return "Give the incident or event a name.";
    if (!periodOk) return "Enter the period as YYYY-MM-DD HH:MM, ending after it starts.";
    const out: Ics214Line[] = [];
    for (const l of lines) {
      if (!l.text.trim()) continue;
      const t = parseContactTime(l.timeText);
      if (t.kind !== "ok") return `"${l.timeText}" isn't a time. Use YYYY-MM-DD HH:MM, or HH:MM for today.`;
      out.push({ at: t.iso, text: l.text, source: l.source });
    }
    return { ...d, period_from: (from as { iso: string }).iso, period_to: (to as { iso: string }).iso, lines: out };
  }

  // Fill a new log from the records once its period is known (ICSF-052).
  const [filledOnce, setFilledOnce] = useState(!isNew);
  useEffect(() => {
    if (!filledOnce && allActivities.length > 0 && periodOk) {
      setFilledOnce(true);
      fillFromRecords();
    }
  }, [allActivities, filledOnce]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fillFromRecords() {
    if (from.kind !== "ok" || to.kind !== "ok") return fail("Enter the period first.");
    const included = inPeriod.filter((a) => !d.excluded_activities.includes(a.id));
    let records: ActivityRecords[];
    let generated: Ics214Line[];
    try {
      records = await loadRecords(included);
      generated = generateLines(records, from.iso, to.iso);
    } catch (e) {
      return fail(`Couldn't read the records: ${e}`);
    }
    // Times typed but not yet saved count, so merging doesn't undo them.
    const saved = lines.map(({ timeText, ...l }) => {
      const t = parseContactTime(timeText);
      return t.kind === "ok" ? { ...l, at: t.iso } : l;
    });
    const { lines: merged, added } = mergeLines(saved, d.dismissed, generated);
    setLines(draftLines(merged));
    if (d.resources.length === 0) {
      const people = resourcesFromRecords(records, from.iso, to.iso);
      if (people.length > 0) change("resources", people);
    }
    if (added > 0) setDirty(true);
    ok(
      added > 0
        ? `Added ${added} ${added === 1 ? "line" : "lines"} from the records.`
        : "Nothing new in the records for this period."
    );
  }

  async function save() {
    const details = current();
    if (typeof details === "string") return fail(details);
    try {
      const log = await api.saveIcs214Log(id, details, operator?.id ?? null);
      setLines(draftLines(log.lines));
      setDirty(false);
      ok("Saved.");
      onSaved(log);
    } catch (e) {
      fail(String(e));
    }
  }

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setDirty(true);
  }

  function deleteLine(i: number) {
    const gone = lines[i];
    setLines((ls) => ls.filter((_, j) => j !== i));
    // A line from the records stays gone when filling again (ICSF-053).
    if (gone.source) change("dismissed", [...d.dismissed, gone.source]);
    setDirty(true);
  }

  function addLine() {
    const last = lines[lines.length - 1];
    const at = new Date().toISOString();
    setLines((ls) => [...ls, { at, text: "", source: null, timeText: last ? last.timeText : localDateTime(at) }]);
    setDirty(true);
  }

  function setResource(i: number, k: "name" | "position" | "agency", v: string) {
    const rows = Array.from({ length: ICS214_RESOURCE_ROWS }, (_, j) => d.resources[j] ?? { name: "", position: "", agency: "" });
    rows[i] = { ...rows[i], [k]: v };
    // Trailing empty rows aren't kept.
    while (rows.length && !rows[rows.length - 1].name && !rows[rows.length - 1].position && !rows[rows.length - 1].agency) rows.pop();
    change("resources", rows);
  }

  const exportable = current();
  const pages = typeof exportable === "string" ? [] : form214Pages(exportable);
  const p = Math.min(page, Math.max(0, pages.length - 1));
  const call = operator?.call_sign ?? "";
  const base = fileSafe(d.incident_name);
  const pageLabel = pages.length > 1 ? ` page ${p + 1}` : "";

  async function saveFile(name: string, content: string, hint: string) {
    try {
      const path = await saveTextFile(name, content);
      if (path) ok(`Saved to ${path}. ${hint}`);
    } catch (e) {
      fail(`Couldn't save: ${e}`);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      ok(`Copied ${what}.`);
    } catch {
      fail("Couldn't copy to the clipboard — use Save instead.");
    }
  }

  async function saveAllPages() {
    const files = pages.flatMap((pg, i) => {
      const msg = form214Message(pg, call);
      const dir = `Page ${i + 1}/`;
      return [
        { path: `${dir}ICS 214 data.txt`, content: form214LoadFile(pg) },
        { path: `${dir}${ICS214_WINLINK_FILENAME}`, content: form214Xml(pg, call) },
        { path: `${dir}message.txt`, content: `${msg.subject}\n\n${msg.body}\n` },
      ];
    });
    try {
      const folder = await saveFilesToFolder(files);
      if (folder) ok(`Saved ${files.length} files under ${folder}, one folder per page.`);
    } catch (e) {
      fail(`Couldn't save: ${e}`);
    }
  }

  const shortened = pages[p]?.shortened ?? 0;
  const resourceRows = Array.from({ length: ICS214_RESOURCE_ROWS }, (_, i) => d.resources[i] ?? { name: "", position: "", agency: "" });

  return (
    <>
      <div className="modal-header">
        <h3>
          <ClipboardList className="heading-icon" />
          ICS 214 — {d.incident_name.trim() || "New activity log"}
        </h3>
        <span className="inline-form">
          <button onClick={save} className="primary">
            Save
          </button>
          <button onClick={leave}>Back to logs</button>
        </span>
      </div>
      {confirmLeave && (
        <div className="confirm-row">
          <p>This log has unsaved changes.</p>
          <div className="inline-form">
            <button onClick={async () => { await save(); setConfirmLeave(false); }}>Save</button>
            <button className="danger" onClick={onBack}>
              Discard changes
            </button>
            <button onClick={() => setConfirmLeave(false)}>Keep editing</button>
          </div>
        </div>
      )}
      {message && (
        <p className={message.error ? "weather-area-error" : "settings-hint"} role="status">
          {message.text}
        </p>
      )}

      <div className="ics214-body">
        <div className="ics-fields">
          <Text label="1. Incident or event name" value={d.incident_name} onChange={(v) => change("incident_name", v)} wide placeholder="e.g. SET 2026" />
          <Text label="2. Period from" value={fromText} onChange={(v) => { setFromText(v); setDirty(true); }} invalid={from.kind !== "ok"} placeholder="YYYY-MM-DD HH:MM" />
          <Text label="Period to" value={toText} onChange={(v) => { setToText(v); setDirty(true); }} invalid={to.kind !== "ok"} placeholder="YYYY-MM-DD HH:MM" />
          <Text label="3. Name" value={d.name} onChange={(v) => change("name", v)} />
          <Text label="4. ICS position" value={d.ics_position} onChange={(v) => change("ics_position", v)} placeholder="e.g. Radio Operator" />
          <Text label="5. Home agency and unit" value={d.home_agency} onChange={(v) => change("home_agency", v)} placeholder="e.g. Orange County ARES" />
          <Text label="Prepared by" value={d.prepared_name} onChange={(v) => change("prepared_name", v)} />
        </div>

        <h4 className="ics-heading">Activities in this period</h4>
        {inPeriod.length === 0 ? (
          <p className="settings-hint">No activities ran or were scheduled in this period.</p>
        ) : (
          <div className="ics214-activities">
            {inPeriod.map((a) => (
              <label key={a.id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={!d.excluded_activities.includes(a.id)}
                  onChange={(e) =>
                    change(
                      "excluded_activities",
                      e.target.checked ? d.excluded_activities.filter((x) => x !== a.id) : [...d.excluded_activities, a.id]
                    )
                  }
                />
                {a.title}
                {a.frequency && <span className="settings-hint"> · {a.frequency}</span>}
              </label>
            ))}
          </div>
        )}

        <h4 className="ics-heading">6. Resources assigned</h4>
        <div className="ics214-resources">
          <span className="settings-hint">Name</span>
          <span className="settings-hint">ICS position</span>
          <span className="settings-hint">Home agency</span>
          {resourceRows.map((r, i) => (
            <ResourceRow key={i} index={i} r={r} onChange={setResource} />
          ))}
        </div>

        <div className="panel-header-row">
          <h4 className="ics-heading">7. Activity log</h4>
          <span className="inline-form">
            <button onClick={fillFromRecords} title="Add new events from the records; your edits stay as they are">
              Fill from records
            </button>
            <button onClick={addLine}>+ Add line</button>
          </span>
        </div>
        {lines.length === 0 && <p className="settings-hint">No lines yet. Fill from the records, or add your own.</p>}
        <div className="ics214-lines">
          {lines.map((l, i) => {
            const bad = parseContactTime(l.timeText).kind !== "ok";
            return (
              <div key={i} className="ics214-line">
                <input
                  aria-label={`Time of line ${i + 1}`}
                  className="checkin-row-mono"
                  value={l.timeText}
                  aria-invalid={bad || undefined}
                  onChange={(e) => setLine(i, { timeText: e.target.value })}
                />
                <input
                  aria-label={`Line ${i + 1}`}
                  value={l.text}
                  placeholder="What happened, e.g. Delivered inject #1"
                  onChange={(e) => setLine(i, { text: e.target.value })}
                />
                <button className="link-button danger-link" aria-label={`Delete line ${i + 1}`} onClick={() => deleteLine(i)}>
                  Delete
                </button>
              </div>
            );
          })}
        </div>

        <h4 className="ics-heading">For Winlink Express</h4>
        {typeof exportable === "string" ? (
          <p className="weather-area-error">{exportable}</p>
        ) : (
          <>
            {pages.length > 1 && (
              <p className="settings-hint">
                Winlink's ICS 214 holds {ICS214_LOG_ROWS} lines a page, so this log is {pages.length} pages.
                <span className="ics-pager">
                  <button disabled={p === 0} onClick={() => setPage(p - 1)}>‹</button>
                  Page {p + 1} of {pages.length}
                  <button disabled={p >= pages.length - 1} onClick={() => setPage(p + 1)}>›</button>
                </span>
              </p>
            )}
            {shortened > 0 && (
              <p className="closeout-warning">
                {shortened} line{shortened === 1 ? " was" : "s were"} shortened to the form's 100-character limit.
              </p>
            )}
            <p className="settings-hint">
              <strong>Load it into Winlink's form:</strong> New Message → Select Template → Standard Forms →
              ICS USA Forms → <em>ICS214 Activity Log</em>, then click <em>Load ICS 214 Data</em> and choose
              the saved file. It fills every field.
            </p>
            <div className="inline-form">
              <button
                onClick={() =>
                  saveFile(`${base} - ICS 214 data${pageLabel}.txt`, form214LoadFile(pages[p]), "In Winlink's ICS 214, click Load ICS 214 Data and choose it.")
                }
              >
                Save file to load
              </button>
              <button onClick={() => copy(form214PasteLines(pages[p]), "the log lines for the form's Paste Data box")}>
                Copy log lines (Paste Data)
              </button>
            </div>
            <p className="settings-hint">
              <strong>Or send it as form data:</strong> save the data file, start a new Winlink message, paste
              the subject and message text, attach the file, address it, and post it.
            </p>
            <div className="inline-form">
              <button onClick={() => saveFile(ICS214_WINLINK_FILENAME, form214Xml(pages[p], call), "Attach it to a new Winlink message.")}>
                Save form data (XML)
              </button>
              <button onClick={() => copy(form214Message(pages[p], call).subject, "the subject")}>Copy subject</button>
              <button onClick={() => copy(form214Message(pages[p], call).body, "the message text")}>
                Copy message text
              </button>
              {pages.length > 1 && <button onClick={saveAllPages}>Save all {pages.length} pages…</button>}
            </div>

            <h4 className="ics-heading">Printable form</h4>
            <div className="inline-form">
              <button
                onClick={() => saveFile(`${base} - ICS 214.html`, ics214Html(exportable), "Open it in a web browser to print it or save it as a PDF.")}
              >
                Save printable form (HTML)
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ResourceRow({
  index,
  r,
  onChange,
}: {
  index: number;
  r: { name: string; position: string; agency: string };
  onChange: (i: number, k: "name" | "position" | "agency", v: string) => void;
}) {
  return (
    <>
      <input aria-label={`Resource ${index + 1} name`} value={r.name} onChange={(e) => onChange(index, "name", e.target.value)} />
      <input aria-label={`Resource ${index + 1} ICS position`} value={r.position} onChange={(e) => onChange(index, "position", e.target.value)} />
      <input aria-label={`Resource ${index + 1} home agency`} value={r.agency} onChange={(e) => onChange(index, "agency", e.target.value)} />
    </>
  );
}
