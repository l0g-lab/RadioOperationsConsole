import { describe, expect, it } from "vitest";
import {
  activitySummaryToText,
  checkinsToCsv,
  parseCsv,
  formatDuration,
  historyToCsv,
  spotterReportsToCsv,
  spotterReportsToText,
} from "./export";
import type { Activity, ActivitySummary, Checkin, HistoryEntry, SpotterReport } from "./types";

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    title: "Tuesday Net",
    activity_type: "directed_net",
    scheduled_at: "2026-09-21",
    frequency: "146.940",
    location_label: "",
    location_lat: null,
    location_lon: null,
    state: "active",
    opened_at: "",
    closed_at: "",
    conclusion: "",
    repeater_name: "",
    repeater_lat: null,
    repeater_lon: null,
    operator_id: "",
    event_id: "",
    record_count: 0,
    event: "",
    ...overrides,
  };
}

function checkin(overrides: Partial<Checkin> = {}): Checkin {
  return {
    id: "c1",
    call_sign: "K4ABC",
    name: "Al, Jr.",
    qth_location: "Miami, FL",
    grid_square: "EL95",
    address: "1 Main St",
    checked_in_at: "2026-09-21T23:04:00Z",
    location_lat: 25.77,
    location_lon: -80.19,
    location_label: "Miami",
    location_manual: false,
    has_traffic: false,
    traffic: "",
    traffic_handled: false,
    frequency: "",
    mode: "",
    rst_sent: "",
    rst_received: "",
    power: "",
    antenna: "",
    notes: "",
    station_kind: "",
    cross_street: "",
    ...overrides,
  };
}

function report(overrides: Partial<SpotterReport> = {}): SpotterReport {
  return {
    id: "r1",
    activity_id: "a1",
    operator_id: "",
    reported_at: "2026-09-21T19:07",
    county: "Polk",
    location_text: "Main & 1st",
    lat: 28,
    lon: -81.9,
    reporter: "N0SPT",
    hazard_type: "Hail",
    magnitude: "1.00 in",
    source: "Trained Spotter",
    notes: "dents",
    checkin_id: null,
    ...overrides,
  };
}

function summary(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    state: "closed",
    opened_at: "2026-09-21T22:00:00Z",
    closed_at: "2026-09-22T00:00:00Z",
    conclusion: "",
    checkins: 1,
    unique_stations: 1,
    removed_checkins: 0,
    first_checkin_at: "",
    last_checkin_at: "",
    spotter_reports: 0,
    hazards: [],
    traffic_items: 0,
    open_traffic_items: 0,
    relay_messages: 0,
    held_relay_messages: 0,
    unpassed_relay_messages: 0,
    largest_hail: "",
    strongest_wind: "",
    counties: [],
    alerts: [],
    weather: [],
    ...overrides,
  };
}

describe("checkinsToCsv", () => {
  it("includes the header row and every field the roster shows", () => {
    const csv = checkinsToCsv([checkin({ has_traffic: true, traffic: 'Need "generator"' })]);
    const [header, row] = csv.trim().split("\r\n");
    expect(header).toBe(
      "Call Sign,Name,Location,Grid Square,Address,Latitude,Longitude,Location Label," +
        "Checked In (Local),Checked In (UTC),Has Traffic,Traffic,Traffic Handled," +
        "Frequency,Mode,RST Sent,RST Received,Power,Antenna,Notes,Station Type,Cross Street"
    );
    expect(row).toContain("K4ABC");
    expect(row).toContain('"Need ""generator"""'); // quotes are doubled and the field is wrapped
    expect(row).toContain("25.77,-80.19");
    expect(row).toContain("2026-09-21T23:04:00Z");
  });

  it("includes a contact's radio details", () => {
    const csv = checkinsToCsv([
      checkin({
        frequency: "146.520",
        mode: "FM",
        rst_sent: "59",
        rst_received: "57",
        power: "5 W",
        antenna: "J-pole",
        notes: "Mobile, I-75",
      }),
    ]);
    expect(csv.trim().split("\r\n")[1]).toMatch(/,146\.520,FM,59,57,5 W,J-pole,"Mobile, I-75",,$/);
  });

  it("includes a range check's station type and cross street (RANGE-022)", () => {
    const csv = checkinsToCsv([
      checkin({
        station_kind: "ht",
        cross_street: "Colonial & Mills",
        rst_sent: "Full quieting",
        rst_received: "Slight noise",
      }),
    ]);
    expect(csv.trim().split("\r\n")[1]).toMatch(/,Full quieting,Slight noise,.*,HT,Colonial & Mills$/);
  });

  it("uses CRLF line endings and ends with one", () => {
    const csv = checkinsToCsv([checkin()]);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(3); // header + 1 row + trailing empty
  });

  it("handles an empty roster (header only)", () => {
    const csv = checkinsToCsv([]);
    expect(csv.trim().split("\r\n")).toHaveLength(1);
  });
});

describe("spotter report exports", () => {
  it("CSV follows the who/what/where column order and includes both times", () => {
    const csv = spotterReportsToCsv([report()]);
    const [header, row] = csv.trim().split("\r\n");
    expect(header.split(",")).toEqual([
      "Reporter",
      "Source",
      "Reported (Local)",
      "Reported (UTC)",
      "Hazard Type",
      "Magnitude",
      "Notes",
      "County",
      "Location",
      "Latitude",
      "Longitude",
      "Grid Square",
    ]);
    expect(row).toContain("N0SPT");
    // A report time with no zone is read as local, so it must produce a UTC value too.
    expect(row).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z/);
  });

  it("sorts CSV rows chronologically regardless of input order", () => {
    const csv = spotterReportsToCsv([
      report({ id: "later", reported_at: "2026-09-21T20:00" }),
      report({ id: "earlier", reported_at: "2026-09-21T19:00" }),
    ]);
    const rows = csv.trim().split("\r\n").slice(1);
    expect(rows[0]).toContain("19:00");
    expect(rows[1]).toContain("20:00");
  });

  it("text report numbers entries, in chronological order, with who/what/where", () => {
    const text = spotterReportsToText(activity(), [
      report({ id: "b", reported_at: "2026-09-21T20:00", hazard_type: "Tornado", magnitude: "" }),
      report({ id: "a", reported_at: "2026-09-21T19:00" }),
    ]);
    const lines = text.split("\n");
    expect(lines[0]).toBe("Spotter reports — Tuesday Net");
    expect(lines[1]).toBe("2 reports");
    // First numbered entry is the earlier report (19:00), not input order.
    const firstEntryLine = lines.find((l) => l.startsWith("1. "))!;
    expect(firstEntryLine).toContain("19:00");
    expect(firstEntryLine).toContain("Hail");
    const secondEntryLine = lines.find((l) => l.startsWith("2. "))!;
    expect(secondEntryLine).toContain("20:00");
    expect(secondEntryLine).toContain("Tornado");
  });
});

describe("historyToCsv", () => {
  const events: HistoryEntry[] = [
    {
      id: "e1",
      entity_type: "activity",
      entity_id: "a1",
      action: "started",
      data: '{"from":"scheduled"}',
      operator: "Bob (K4NCS)",
      created_at: "2026-09-21T22:00:00Z",
      subject: "Tuesday Net",
      activity_id: "a1",
      activity_title: "Tuesday Net",
    },
    {
      id: "e2",
      entity_type: "checkin",
      entity_id: "c1",
      action: "correct",
      data: "{}",
      operator: "",
      created_at: "2026-09-21T23:10:00Z",
      subject: "W4ABC",
      activity_id: "a1",
      activity_title: "Tuesday Net",
    },
  ];

  it("says what happened as the History tab does, then keeps the record as stored (AUDIT-022)", () => {
    const rows = parseCsv(historyToCsv(events));
    expect(rows[0]).toEqual([
      "Time (Local)", "Time (UTC)", "What Happened", "Who", "Record Type", "Action", "Recorded Data", "Record Id",
    ]);
    expect(rows).toHaveLength(3); // header + 2 events
    expect(rows[1].slice(2)).toEqual(["Started Tuesday Net", "Bob (K4NCS)", "activity", "started", '{"from":"scheduled"}', "a1"]);
    expect(rows[2][2]).toBe("Edited W4ABC's check-in");
    expect(rows[2][7]).toBe("c1"); // the event's own record id
    expect(rows[1][1]).toBe("2026-09-21T22:00:00Z");
  });

  it("names the operators a net was moved between", () => {
    const moved = { ...events[0], action: "change_operator", data: '{"from":"o1","to":"o2"}' };
    const names: Record<string, string> = { o1: "W0LAB", o2: "K4NCS" };
    expect(parseCsv(historyToCsv([moved], (id) => names[id] ?? null))[1][2]).toBe(
      "Changed who runs Tuesday Net from W0LAB to K4NCS"
    );
  });

  it("handles an empty history", () => {
    expect(historyToCsv([]).trim().split("\r\n")).toHaveLength(1);
  });
});

describe("formatDuration", () => {
  it("formats minutes only under an hour", () => {
    expect(formatDuration("2026-09-21T19:00:00Z", "2026-09-21T19:45:00Z")).toBe("45 min");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration("2026-09-21T19:00:00Z", "2026-09-21T21:15:00Z")).toBe("2 h 15 min");
  });

  it("returns empty for an end before the start, or unparseable input", () => {
    expect(formatDuration("2026-09-21T21:00:00Z", "2026-09-21T19:00:00Z")).toBe("");
    expect(formatDuration("", "2026-09-21T19:00:00Z")).toBe("");
    expect(formatDuration("2026-09-21T19:00:00Z", "not a date")).toBe("");
  });
});

describe("activitySummaryToText", () => {
  it("includes the title, type, start/end times, duration, facts, and conclusion", () => {
    const text = activitySummaryToText(activity(), summary({ conclusion: "Good turnout" }));
    expect(text).toContain("Tuesday Net");
    expect(text).toContain("Directed net");
    expect(text).toContain("Started:");
    expect(text).toContain("Ended:");
    expect(text).toContain("Duration:");
    expect(text).toContain("1 check-in");
    expect(text).toContain("Conclusion:\nGood turnout");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("adds a SKYWARN net's largest hail, counties, and attached alerts", () => {
    const alert = {
      id: "a1",
      nws_id: "",
      headline: "",
      area_desc: "",
      severity: "",
      effective: "",
      ends: "",
      attached_at: "",
    };
    const text = activitySummaryToText(
      activity({ activity_type: "skywarn" }),
      summary({
        largest_hail: "1.00 in (Quarter) — Severe threshold",
        counties: [{ county: "Orange", count: 2 }],
        alerts: [
          { ...alert, event: "Tornado Watch" },
          { ...alert, id: "a2", event: "Tornado Warning" },
        ],
      })
    );
    expect(text).toContain("Largest hail: 1.00 in (Quarter) — Severe threshold\nBy county: Orange 2\nNWS alerts:\n  Tornado Watch\n  Tornado Warning");
    expect(text).not.toContain("Strongest wind");
  });

  it("gives the weather as it started and ended, or why there's none (net-weather.md)", () => {
    const w = {
      outcome: "ok" as const,
      place: "repeater" as const,
      station_id: "KORL",
      station_name: "Orlando Executive Airport",
      observed_at: "2026-09-21T21:53:00Z",
      temp_c: 26,
      wind_dir_deg: 180,
      wind_speed_kmh: 24.1,
      wind_gust_kmh: null,
    };
    const text = activitySummaryToText(
      activity(),
      summary({
        weather: [
          { ...w, moment: "start", conditions: "Thunderstorms", alerts: ["Severe Thunderstorm Warning"] },
          { ...w, moment: "end", conditions: "Light Rain", alerts: [] },
        ],
      })
    );
    expect(text).toContain("Weather (start): 79°F, Thunderstorms, wind S 15 mph; Severe Thunderstorm Warning");
    expect(text).toContain("Weather (end): 79°F, Light Rain, wind S 15 mph");
    const offline = summary({
      weather: [{ ...w, moment: "start", outcome: "offline", conditions: "", alerts: [] }],
    });
    expect(activitySummaryToText(activity(), offline)).toContain("Weather (start): Not recorded — working offline");
    expect(activitySummaryToText(activity(), summary())).not.toContain("Weather");
    expect(activitySummaryToText(activity({ activity_type: "station_log" }), offline)).not.toContain("Weather");
  });

  it("leaves a station log's start and end out", () => {
    const text = activitySummaryToText(activity({ activity_type: "station_log" }), summary());
    expect(text).not.toMatch(/Started|Not started|Ended|Duration/);
  });

  it("says 'Not started' when there's no opened_at, and omits Ended/Duration", () => {
    const text = activitySummaryToText(activity(), summary({ opened_at: "", closed_at: "" }));
    expect(text).toContain("Not started");
    expect(text).not.toContain("Ended:");
    expect(text).not.toContain("Duration:");
  });

  it("never leaves more than one blank line in a row", () => {
    const text = activitySummaryToText(activity(), summary({ conclusion: "" }));
    expect(text).not.toMatch(/\n\n\n/);
  });
});

describe("parseCsv", () => {
  it("reads back exactly what the CSV export writes", () => {
    const tricky = checkin({
      name: 'Al "the Pal", Jr.',
      address: "1 Main St\nApt 2",
      traffic: "",
      has_traffic: true,
    });
    const text = checkinsToCsv([tricky, checkin()]);
    const rows = parseCsv(text);
    expect(rows).toHaveLength(3);
    expect(rows[0][0]).toBe("Call Sign");
    expect(rows[1]).toContain('Al "the Pal", Jr.');
    expect(rows[1]).toContain("1 Main St\nApt 2");
    expect(rows.every((r) => r.length === rows[0].length)).toBe(true);
  });

  it("handles a last line without a line break, and empty fields", () => {
    expect(parseCsv("a,,c\r\n1,2,")).toEqual([
      ["a", "", "c"],
      ["1", "2", ""],
    ]);
  });
});
