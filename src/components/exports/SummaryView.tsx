import { useEffect, type ReactNode } from "react";
import type { Activity, ActivitySummary } from "../../types";
import { formatDuration } from "../../export";
import { isLog, visibleSections } from "../../activityTypes";
import { weatherLines } from "../../netWeather";
import { stormLines } from "../../summaryFacts";
import { pad2 } from "../../utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hm = (h: number, m: number) => `${pad2(h)}:${pad2(m)}`;

/** "Sun 10/4 19:00" local, with "(23:00 UTC)" — the UTC date too when it differs. */
function when(iso: string): { local: string; utc: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { local: iso, utc: "" };
  const local = `${WEEKDAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()} ${hm(d.getHours(), d.getMinutes())}`;
  const sameDay = d.getUTCDate() === d.getDate();
  const utcDay = sameDay ? "" : `${d.getUTCMonth() + 1}/${d.getUTCDate()} `;
  return { local, utc: `${utcDay}${hm(d.getUTCHours(), d.getUTCMinutes())} UTC` };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One line of the summary: a label, and what it says. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/**
 * An activity's summary on the Operations tab, one fact a line: the counts its
 * type emphasises (and any others with records), when it started and ended,
 * how long it ran, anything left open, and the closing notes. The activity's
 * type, date, and frequency are shown just above it, so aren't repeated.
 */
/**
 * The weather as it started and ended, alerts in amber, or why there's none.
 * Nothing before it starts (or for nets from before weather was recorded).
 */
function WeatherRow({ summary }: { summary: ActivitySummary }) {
  if (summary.weather.length === 0) return null;
  return (
    <Row label="Weather">
      {weatherLines(summary.weather).map((line, i) => {
        const w = summary.weather[i];
        return (
          <div
            key={w.moment}
            className="summary-weather-line"
            title={
              line.missing
                ? undefined
                : `Reported by ${w.station_id}${w.station_name ? ` (${w.station_name})` : ""}, ${when(w.observed_at).local}`
            }
          >
            <span className="summary-detail">{line.label}: </span>
            {line.missing ? <span className="summary-detail">{line.text}</span> : line.text}
            {line.alerts.length > 0 && <span className="summary-warning"> · {line.alerts.join(", ")}</span>}
          </div>
        );
      })}
    </Row>
  );
}

export function SummaryView({
  activity,
  summary,
  notes,
}: {
  activity: Activity;
  summary: ActivitySummary;
  /** The closing notes to show (saved, or still being written). */
  notes: string;
}) {
  const shown = visibleSections(activity.activity_type, summary);
  const log = isLog(activity.activity_type);
  const ended = summary.closed_at || "";
  const duration = summary.opened_at
    ? formatDuration(summary.opened_at, ended || new Date().toISOString())
    : "";
  const started = summary.opened_at ? when(summary.opened_at) : null;
  const finished = ended ? when(ended) : null;
  const relayPassed = summary.relay_messages - summary.held_relay_messages - summary.unpassed_relay_messages;

  return (
    <dl className="summary-list">
      {shown.has("checkins") && (
        <Row label="Check-ins">
          {summary.checkins}
          {summary.checkins > 0 && (
            <span className="summary-detail"> · {plural(summary.unique_stations, "station", "stations")}</span>
          )}
        </Row>
      )}
      {shown.has("traffic") && (
        <Row label="Traffic">
          {plural(summary.traffic_items, "check-in", "check-ins")} with traffic
          {summary.open_traffic_items > 0 && (
            <span className="summary-warning" role="alert">
              {" "}
              · {summary.open_traffic_items} not marked handled
            </span>
          )}
        </Row>
      )}
      {shown.has("spotter") && (
        <Row label="Spotter reports">
          {summary.spotter_reports}
          {summary.hazards.length > 0 && (
            <span className="summary-detail">
              {" "}
              · {summary.hazards.map((h) => `${h.hazard_type} ${h.count}`).join(", ")}
            </span>
          )}
        </Row>
      )}
      {stormLines(summary).map((l) => (
        <Row key={l.key} label={l.label}>
          {l.lines.map((t) => (
            <div key={t}>{t}</div>
          ))}
        </Row>
      ))}
      {shown.has("relay") && (
        <Row label="Relayed messages">
          {summary.relay_messages}
          {summary.relay_messages > 0 && <span className="summary-detail"> · {relayPassed} passed</span>}
          {summary.held_relay_messages > 0 && (
            <span className="summary-warning" role="alert">
              {" "}
              · {summary.held_relay_messages} still to pass
            </span>
          )}
          {summary.unpassed_relay_messages > 0 && (
            <span className="summary-detail"> · {summary.unpassed_relay_messages} not passed</span>
          )}
        </Row>
      )}
      {/* A station log stays open for days, so its start, end and weather mean little. */}
      {!log && (
        <>
          <Row label="Started">
            {started ? (
              <>
                {started.local} <span className="summary-detail">({started.utc})</span>
              </>
            ) : (
              <span className="summary-detail">Not started yet</span>
            )}
          </Row>
          {finished && (
            <Row label="Ended">
              {finished.local} <span className="summary-detail">({finished.utc})</span>
            </Row>
          )}
          {duration && <Row label={ended ? "Lasted" : "Running for"}>{duration}</Row>}
          <WeatherRow summary={summary} />
        </>
      )}
      <Row label="Notes">{notes || <span className="summary-detail">None recorded</span>}</Row>
    </dl>
  );
}

/** The outcome of a Copy or Save. */
export function ActionMessage({ message }: { message: { text: string; error: boolean } | null }) {
  if (!message) return null;
  return (
    <span className={message.error ? "weather-area-error" : "settings-hint"} role="status">
      {message.text}
    </span>
  );
}

/** Closes a window on Escape. */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}
