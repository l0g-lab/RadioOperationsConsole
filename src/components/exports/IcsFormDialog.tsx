import { useEffect, useMemo, useState } from "react";
import * as api from "../../api";
import type { Activity, Checkin, RelayMessage } from "../../types";
import { isRelay } from "../../activityTypes";
import { relay309Entries } from "../../relay";
import { exportFilename, saveFilesToFolder, saveTextFile } from "../../export";
import {
  comms309Entries,
  FORM309_ROWS,
  FORM309_WINLINK_FILENAME,
  form309Data,
  form309Message,
  form309Pages,
  form309Rows,
  form309Xml,
  ICS213_WINLINK_FILENAME,
  ics213Html,
  ics213Message,
  ics213WinlinkXml,
  ics309Html,
  localDate,
  localDateTime,
  localTime,
  type GeneralMessage213Input,
} from "../../icsForms";
import { FileText } from "lucide-react";

type Props = {
  activity: Activity;
  operatorName: string;
  operatorCall: string;
  onClose: () => void;
} & (
  | {
      form: "309";
      /** An event's activities, for one log of them all (EVT-040); just `activity` when absent. */
      event?: { name: string; activities: Activity[] };
      /** Who ran an activity (its "to" on each line); the header's call sign otherwise. */
      callFor?: (a: Activity) => string;
    }
  | { form: "213"; initial: GeneralMessage213Input }
);

function Text({
  label,
  value,
  onChange,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "ics-field ics-field-wide" : "ics-field"}>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/**
 * Fills in an ICS 309 (Communications Log, from the check-in list) or an ICS 213
 * (General Message, carrying spotter reports), lets the operator adjust the
 * fields, and saves it two ways: as data to load into Winlink Express, and as a
 * printable HTML file (open it in a browser and print or save as PDF).
 */
export default function IcsFormDialog(props: Props) {
  const { activity, operatorName, operatorCall, onClose } = props;
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);

  const ok = (text: string) => setMessage({ text, error: false });
  const fail = (text: string) => setMessage({ text, error: true });

  async function save(name: string, content: string, hint: string) {
    try {
      const path = await saveTextFile(name, content);
      if (path) ok(`Saved to ${path}. ${hint}`);
    } catch (e) {
      fail(`Couldn't save: ${e}`);
    }
  }

  async function saveFolder(files: { path: string; content: string }[], hint: string) {
    try {
      const folder = await saveFilesToFolder(files);
      if (folder) ok(`Saved ${files.length} files under ${folder}. ${hint}`);
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

  const PRINT_HINT = "Open it in a web browser to print it or save it as a PDF.";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel lifecycle-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <FileText className="heading-icon" />
            {props.form === "309" ? "ICS 309 — Communications Log" : "ICS 213 — General Message"}
          </h3>
          <button onClick={onClose}>Close</button>
        </div>
        {props.form === "309" ? (
          <Form309
            activity={activity}
            event={props.event}
            callFor={props.callFor}
            operatorName={operatorName}
            operatorCall={operatorCall}
            save={save}
            saveFolder={saveFolder}
            copy={copy}
            onSavePrint={(html) =>
              save(exportFilename(fileActivity(activity, props.event), "ICS 309", "html"), html, PRINT_HINT)
            }
          />
        ) : (
          <Form213
            initial={props.initial}
            senderCall={operatorCall}
            copy={copy}
            onSaveWinlink={(xml) =>
              save(
                ICS213_WINLINK_FILENAME,
                xml,
                "Attach this file to a new message in Winlink Express."
              )
            }
            onSavePrint={(html) =>
              save(exportFilename(activity, "ICS 213", "html"), html, PRINT_HINT)
            }
          />
        )}
        {message && (
          <p className={message.error ? "weather-area-error" : "qrz-status qrz-status-found"}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

/** What files are named after: the activity, or the event for a combined log. */
function fileActivity(activity: Activity, event?: { name: string }): Activity {
  return event ? { ...activity, title: event.name } : activity;
}

type SaveFn = (name: string, content: string, hint: string) => void;
type SaveFolderFn = (files: { path: string; content: string }[], hint: string) => void;
type CopyFn = (text: string, what: string) => void;

function Form309({
  activity: focused,
  event,
  callFor,
  operatorName,
  operatorCall,
  save,
  saveFolder,
  copy,
  onSavePrint,
}: {
  activity: Activity;
  event?: { name: string; activities: Activity[] };
  callFor?: (a: Activity) => string;
  operatorName: string;
  operatorCall: string;
  save: SaveFn;
  saveFolder: SaveFolderFn;
  copy: CopyFn;
  onSavePrint: (html: string) => void;
}) {
  // One activity, or every activity in an event, any of which can be left out.
  const all = useMemo(() => event?.activities ?? [focused], [event, focused]);
  const [left, setLeft] = useState<Set<string>>(new Set());
  const included = all.filter((a) => !left.has(a.id));
  // The one whose times and names the header starts from.
  const activity = included[0] ?? focused;
  const [records, setRecords] = useState<Map<string, { checkins: Checkin[]; relayed: RelayMessage[] }>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const anyRelay = all.some((a) => isRelay(a.activity_type));

  useEffect(() => {
    Promise.all(
      all.map(async (a) => {
        // A relay station logs messages in and out instead of check-ins (RELAY-041).
        const [c, m] = await Promise.all([
          api.listCheckins(a.id).catch(() => [] as Checkin[]),
          isRelay(a.activity_type) ? api.listRelayMessages(a.id).catch(() => [] as RelayMessage[]) : [],
        ]);
        return [a.id, { checkins: c, relayed: m }] as const;
      })
    ).then((pairs) => {
      setRecords(new Map(pairs));
      setLoaded(true);
    });
  }, [all]);

  const netControl = operatorCall || operatorName || (anyRelay ? "Relay" : "Net control");
  const entries = useMemo(
    () =>
      included
        .flatMap((a) => {
          const r = records.get(a.id);
          if (!r) return [];
          const to = callFor?.(a) || netControl;
          return isRelay(a.activity_type) ? relay309Entries(r.relayed, to) : comms309Entries(r.checkins, to);
        })
        .sort((x, y) => x.at - y.at),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, left, netControl, callFor]
  );
  const { rows, continued } = useMemo(() => form309Rows(entries), [entries]);
  const pages = useMemo(() => form309Pages(rows), [rows]);
  const page = Math.min(pageIndex, pages.length - 1);

  const [incidentName, setIncidentName] = useState(event?.name ?? activity.title);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [netName, setNetName] = useState(event?.name ?? activity.title);
  const [opName, setOpName] = useState(operatorName);
  const [opCall, setOpCall] = useState(operatorCall);
  const [prepName, setPrepName] = useState(operatorName);
  const [prepPosition, setPrepPosition] = useState("");
  const [task, setTask] = useState("");
  const [opPeriod, setOpPeriod] = useState("");

  // The period starts when the first included net did and ends when the last
  // did, or else at the first and last entries.
  useEffect(() => {
    if (!loaded) return;
    const iso = (at: number) => new Date(at).toISOString();
    const opened = included.map((a) => a.opened_at).filter(Boolean).sort();
    const closed = included.map((a) => a.closed_at).filter(Boolean).sort();
    const stillOn = included.some((a) => a.state === "active");
    const from = localDateTime(opened[0] ?? "") || (entries[0] ? localDateTime(iso(entries[0].at)) : "");
    setPeriodFrom(from);
    setPeriodTo(
      (!stillOn && localDateTime(closed[closed.length - 1] ?? "")) ||
        (entries.length ? localDateTime(iso(entries[entries.length - 1].at)) : "")
    );
    // Winlink's "Operational Period #" is a short label; the start date, as YYYYMMDD, is a sensible default.
    setOpPeriod(from.slice(0, 10).replace(/-/g, ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, left]);

  const now = new Date();
  const preparedAt = `${localDate(now)} ${localTime(now)}`;
  const header = {
    title: netName,
    task,
    taskName: incidentName,
    preparedAt,
    opPeriod,
    opName,
    stationId: opCall,
  };

  const pageCount = pages.length;
  const label = (i: number) => (pageCount > 1 ? `_page${i + 1}` : "");

  function pageFiles(i: number, folder: boolean) {
    const rowsI = pages[i];
    const dir = folder && pageCount > 1 ? `Page ${i + 1}/` : "";
    const msg = form309Message(rowsI, header, i + 1, opCall);
    return [
      {
        path: `${dir}Form 309 data${folder ? "" : label(i)}.txt`,
        content: form309Data(rowsI, header),
      },
      {
        path: `${dir}${FORM309_WINLINK_FILENAME}`,
        content: form309Xml(rowsI, header, i + 1, opCall),
      },
      { path: `${dir}message.txt`, content: `${msg.subject}\n\n${msg.body}\n` },
    ];
  }

  function buildHtml(): string {
    return ics309Html({
      incidentName,
      periodFrom,
      periodTo,
      netName,
      operatorName: opName,
      operatorCall: opCall,
      preparedByName: prepName,
      preparedByPosition: prepPosition,
      preparedAt,
      entries,
    });
  }

  const current = pageFiles(page, false);
  const msg = form309Message(pages[page], header, page + 1, opCall);
  const empty = loaded && entries.length === 0;

  return (
    <>
      <p className="settings-hint">
        {event
          ? `Every activity in ${event.name} in one log, oldest first: check-ins to whoever ran each net, and relayed messages in and out.`
          : anyRelay
            ? "Each relayed message as it came in and as it was passed on, with failed attempts, oldest first."
            : "One line per check-in, oldest first, addressed to net control."}{" "}
        {loaded ? `${entries.length} entries.` : "Loading…"}
      </p>
      {event && all.length > 1 && (
        <div className="ics214-activities">
          {all.map((a) => (
            <label key={a.id} className="checkbox-row">
              <input
                type="checkbox"
                checked={!left.has(a.id)}
                onChange={(e) =>
                  setLeft((cur) => {
                    const next = new Set(cur);
                    if (e.target.checked) next.delete(a.id);
                    else next.add(a.id);
                    return next;
                  })
                }
              />
              {a.title}
              <span className="settings-hint">
                {" "}
                · {records.get(a.id) ? (isRelay(a.activity_type) ? `${records.get(a.id)!.relayed.length} messages` : `${records.get(a.id)!.checkins.length} check-ins`) : "…"}
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="ics-fields">
        <Text label="Task name / incident" value={incidentName} onChange={setIncidentName} wide />
        <Text label="Radio operator name" value={opName} onChange={setOpName} />
        <Text label="Station ID / call sign" value={opCall} onChange={setOpCall} />
        <Text label="Task # (Winlink, up to 7 characters)" value={task} onChange={setTask} />
        <Text label="Operational period # (Winlink)" value={opPeriod} onChange={setOpPeriod} />
      </div>

      <h4 className="ics-heading">For Winlink Express</h4>
      {pageCount > 1 && (
        <p className="settings-hint">
          Winlink's Form 309 holds {FORM309_ROWS} lines a page, so this log is {pageCount} pages.
          <span className="ics-pager">
            <button disabled={page === 0} onClick={() => setPageIndex(page - 1)}>
              ‹
            </button>
            Page {page + 1} of {pageCount}
            <button disabled={page >= pageCount - 1} onClick={() => setPageIndex(page + 1)}>
              ›
            </button>
          </span>
        </p>
      )}
      {continued > 0 && (
        <p className="settings-hint">
          {continued} {continued === 1 ? "message is" : "messages are"} longer than the form's
          90-character line, so {continued === 1 ? "it runs" : "they run"} on to the next line.
        </p>
      )}
      <p className="settings-hint">
        <strong>Load it into Winlink's form:</strong> New Message → Select Template → Standard Forms
        → ICS USA Forms → <em>Form-309 Communications Log</em>, then click{" "}
        <em>Load Form 309 Data</em> and choose the saved file. It fills the log lines and the
        header.
      </p>
      <div className="inline-form">
        <button
          disabled={!loaded || empty}
          onClick={() =>
            save(
              exportFilename(
                fileActivity(activity, event),
                `Form 309 data${pageCount > 1 ? ` page ${page + 1}` : ""}`,
                "txt"
              ),
              current[0].content,
              "In Winlink's Form 309, click Load Form 309 Data and choose it."
            )
          }
        >
          Save file for Winlink (Load Form 309 Data)
        </button>
        <button
          disabled={!loaded || empty}
          onClick={() => copy(current[0].content, "the page for Winlink's Paste Data box")}
        >
          Copy (Paste Data)
        </button>
      </div>
      <p className="settings-hint">
        <strong>Or send the log as form data:</strong> save the data file, start a new Winlink
        message, paste the subject and message text, attach the file, address it, and post it.
      </p>
      <div className="inline-form">
        <button
          disabled={!loaded || empty}
          onClick={() =>
            save(
              FORM309_WINLINK_FILENAME,
              current[1].content,
              "Attach it to a new Winlink message."
            )
          }
        >
          Save form data (XML)
        </button>
        <button disabled={!loaded || empty} onClick={() => copy(msg.subject, "the subject")}>
          Copy subject
        </button>
        <button disabled={!loaded || empty} onClick={() => copy(msg.body, "the message text")}>
          Copy message text
        </button>
        {pageCount > 1 && (
          <button
            onClick={() =>
              saveFolder(
                pages.flatMap((_, i) => pageFiles(i, true)),
                "Each page is in its own folder, with its load file, form data, and message text."
              )
            }
          >
            Save all {pageCount} pages…
          </button>
        )}
      </div>

      <h4 className="ics-heading">Printable form</h4>
      <div className="ics-fields">
        <Text label="2. Period from" value={periodFrom} onChange={setPeriodFrom} />
        <Text label="Period to" value={periodTo} onChange={setPeriodTo} />
        <Text label="3. Radio net name / position" value={netName} onChange={setNetName} wide />
        <Text label="6. Prepared by" value={prepName} onChange={setPrepName} />
        <Text label="Position / title" value={prepPosition} onChange={setPrepPosition} />
      </div>
      <div className="inline-form">
        <button onClick={() => onSavePrint(buildHtml())} disabled={!loaded}>
          Save printable form (HTML)
        </button>
      </div>
    </>
  );
}

function Form213({
  initial,
  senderCall,
  copy,
  onSaveWinlink,
  onSavePrint,
}: {
  initial: GeneralMessage213Input;
  senderCall: string;
  copy: CopyFn;
  onSaveWinlink: (xml: string) => void;
  onSavePrint: (html: string) => void;
}) {
  const [f, setF] = useState(initial);
  const set = (k: keyof GeneralMessage213Input) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <>
      <p className="settings-hint">
        Filled in from the spotter report(s). Add who it's to and anything else, then save. For
        Winlink Express: start a new message, paste the subject and message text, attach the saved
        form data, address it, and post it.
      </p>
      <div className="ics-fields">
        <Text label="1. Incident name" value={f.incidentName} onChange={set("incidentName")} wide />
        <Text label="2. To (name)" value={f.toName} onChange={set("toName")} />
        <Text label="To (position)" value={f.toPosition} onChange={set("toPosition")} />
        <Text label="3. From (name)" value={f.fromName} onChange={set("fromName")} />
        <Text label="From (position)" value={f.fromPosition} onChange={set("fromPosition")} />
        <Text label="4. Subject" value={f.subject} onChange={set("subject")} wide />
        <Text label="5. Date" value={f.date} onChange={set("date")} />
        <Text label="6. Time" value={f.time} onChange={set("time")} />
        <label className="ics-field ics-field-wide">
          7. Message
          <textarea rows={7} value={f.message} onChange={(e) => set("message")(e.target.value)} />
        </label>
        <Text label="8. Approved by (name)" value={f.approvedName} onChange={set("approvedName")} />
        <Text
          label="Approved by (position)"
          value={f.approvedPosition}
          onChange={set("approvedPosition")}
        />
      </div>
      <div className="inline-form">
        <button onClick={() => onSaveWinlink(ics213WinlinkXml(f, senderCall))}>
          Save Winlink form data (XML)
        </button>
        <button onClick={() => copy(ics213Message(f, senderCall).subject, "the subject")}>
          Copy subject
        </button>
        <button onClick={() => copy(ics213Message(f, senderCall).body, "the message text")}>
          Copy message text
        </button>
        <button onClick={() => onSavePrint(ics213Html(f))}>Save printable form (HTML)</button>
      </div>
    </>
  );
}
