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
import type { Activity, ActivitySummary, Checkin, HistoryEvent, SpotterReport } from "./types";

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
  const events: HistoryEvent[] = [
    {
      id: "e1",
      entity_type: "activity",
      entity_id: "a1",
      action: "started",
      data: '{"from":"scheduled"}',
      operator: "Bob (K4NCS)",
      created_at: "2026-09-21T22:00:00Z",
    },
    {
      id: "e2",
      entity_type: "checkin",
      entity_id: "c1",
      action: "correct",
      data: "{}",
      operator: "",
      created_at: "2026-09-21T23:10:00Z",
    },
  ];

  it("includes every event with both times, the operator, and the record it applies to", () => {
    const csv = historyToCsv(events);
    const rows = csv.trim().split("\r\n");
    expect(rows).toHaveLength(3); // header + 2 events
    expect(rows[1]).toContain("activity");
    expect(rows[1]).toContain("started");
    expect(rows[1]).toContain("Bob (K4NCS)");
    expect(rows[2]).toContain("checkin");
    expect(rows[2]).toContain("c1"); // the event's own record id
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
