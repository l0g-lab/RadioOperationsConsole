import { describe, expect, it } from "vitest";
import {
  activitiesInPeriod,
  form214LoadFile,
  form214Message,
  form214Pages,
  form214Xml,
  generateLines,
  ICS214_LOG_ROWS,
  mergeLines,
  resourcesFromRecords,
  type ActivityRecords,
} from "./ics214";
import type { Activity, ActivitySummary, Checkin, HistoryEntry, Ics214Details, SpotterReport } from "./types";

// October 3, 2026, local time.
const at = (h: number, m = 0) => new Date(2026, 9, 3, h, m).toISOString();
const FROM = at(9);
const TO = at(12);

function activity(o: Partial<Activity>): Activity {
  return {
    id: "a1",
    title: "SET 1 – Ham net",
    activity_type: "directed_net",
    scheduled_at: "",
    frequency: "146.940 -0.600 PL 100.0",
    location_label: "",
    location_lat: null,
    location_lon: null,
    state: "closed",
    opened_at: at(9),
    closed_at: at(9, 28),
    conclusion: "",
    repeater_name: "",
    repeater_lat: null,
    repeater_lon: null,
    operator_id: "",
    event_id: "",
    record_count: 0,
    event: "",
    ...o,
  };
}

const summary = (o: Partial<ActivitySummary> = {}): ActivitySummary => ({
  state: "closed",
  opened_at: "",
  closed_at: "",
  conclusion: "",
  checkins: 14,
  unique_stations: 13,
  removed_checkins: 0,
  first_checkin_at: "",
  last_checkin_at: "",
  spotter_reports: 0,
  hazards: [],
  traffic_items: 2,
  open_traffic_items: 0,
  relay_messages: 0,
  held_relay_messages: 0,
  unpassed_relay_messages: 0,
  weather: [],
  ...o,
});

const handled = (id: string, when: string, on = true, operator = "Pat"): HistoryEntry => ({
  id: `h-${id}-${when}`,
  entity_type: "checkin",
  entity_id: id,
  action: "traffic_handled",
  data: JSON.stringify({ handled: on }),
  operator,
  created_at: when,
  subject: "",
  activity_id: "",
  activity_title: "",
});

function records(): ActivityRecords[] {
  return [
    {
      activity: activity({ conclusion: "Quiet net." }),
      summary: summary({ conclusion: "Quiet net." }),
      checkins: [
        { id: "c1", call_sign: "KD4ABC", traffic: "Shelter needs water" } as Checkin,
        { id: "c2", call_sign: "W1AW", traffic: "" } as Checkin,
      ],
      history: [
        handled("c1", at(9, 20)),
        // Marked, then un-marked: not handled.
        handled("c2", at(9, 21)),
        handled("c2", at(9, 22), false),
        // A check-in removed since: left out.
        handled("gone", at(9, 23)),
      ],
      reports: [],
    },
    {
      activity: activity({
        id: "a3",
        title: "SET 3 – HF relays",
        frequency: "7.188 LSB",
        opened_at: at(10, 30),
        closed_at: "",
        state: "active",
      }),
      summary: null,
      checkins: [],
      history: [],
      reports: [
        // Spotter report times are local, without a zone.
        { id: "r1", reported_at: "2026-10-03T10:40", hazard_type: "Hail", magnitude: "1.00 in", location_text: "Colonial & Mills", county: "Orange", reporter: "KD4ABC" } as SpotterReport,
        // Outside the period.
        { id: "r2", reported_at: "2026-10-03T13:00", hazard_type: "Wind Damage", magnitude: "", location_text: "", county: "", reporter: "" } as SpotterReport,
      ],
    },
  ];
}

describe("generateLines (ICSF-052)", () => {
  it("lists nets opened and closed, closing notes, traffic handled and spotter reports in the period, in time order", () => {
    const lines = generateLines(records(), FROM, TO);
    expect(lines.map((l) => [l.source, l.text])).toEqual([
      ["start:a1", "Opened SET 1 – Ham net (Directed net) on 146.940 -0.600 PL 100.0"],
      ["traffic:c1", "Handled traffic from KD4ABC: Shelter needs water"],
      ["end:a1", "Closed SET 1 – Ham net: 14 check-ins (13 stations), 2 with traffic"],
      ["notes:a1", "SET 1 – Ham net closing notes: Quiet net."],
      ["start:a3", "Opened SET 3 – HF relays (Directed net) on 7.188 LSB"],
      ["report:r1", "Spotter report from KD4ABC: Hail 1.00 in, Colonial & Mills"],
    ]);
  });

  it("leaves out what falls outside the period", () => {
    expect(generateLines(records(), at(10), at(11)).map((l) => l.source)).toEqual(["start:a3", "report:r1"]);
  });
});

describe("mergeLines (ICSF-053)", () => {
  it("adds new records' lines but keeps edits, lines added by hand, and deletions", () => {
    const generated = generateLines(records(), FROM, TO);
    const saved = [
      { ...generated[0], text: "Opened the ham net (edited)" },
      { at: at(10, 15), text: "Delivered inject #1", source: null },
    ];
    const { lines, added } = mergeLines(saved, ["end:a1"], generated);
    expect(added).toBe(4);
    expect(lines.map((l) => l.source ?? l.text)).toEqual([
      "start:a1",
      "traffic:c1",
      "notes:a1",
      "Delivered inject #1",
      "start:a3",
      "report:r1",
    ]);
    expect(lines[0].text).toBe("Opened the ham net (edited)");
    // Refreshing again adds nothing.
    expect(mergeLines(lines, ["end:a1"], generated).added).toBe(0);
  });
});

describe("period defaults (ICSF-051, ICSF-054)", () => {
  it("finds activities that ran or were scheduled in the period", () => {
    const acts = [
      activity({}),
      activity({ id: "early", opened_at: at(7), closed_at: at(8) }),
      activity({ id: "still-open", opened_at: at(8), closed_at: "" }),
      activity({ id: "planned", opened_at: "", closed_at: "", scheduled_at: "2026-10-03 11:30" }),
      activity({ id: "tomorrow", opened_at: "", closed_at: "", scheduled_at: "2026-10-04 09:00" }),
    ];
    expect(activitiesInPeriod(acts, FROM, TO).map((a) => a.id)).toEqual(["a1", "still-open", "planned"]);
  });

  it("lists the operators recorded in the period as resources", () => {
    const r = records();
    r[0].history.push(handled("c1", at(9, 25), true, "Bob"), handled("c1", at(13), true, "Later"));
    expect(resourcesFromRecords(r, FROM, TO).map((x) => x.name)).toEqual(["Bob", "Pat"]);
  });
});

describe("Winlink ICS 214 (ICSF-055, ICSF-056)", () => {
  const log = (lineCount: number): Ics214Details => ({
    incident_name: "SET 2026",
    period_from: FROM,
    period_to: TO,
    name: "Pat Jones K4NCS",
    ics_position: "Radio Operator",
    home_agency: "Orange County ARES",
    prepared_name: "Pat Jones",
    resources: [{ name: "Bob W1AW", position: "Relay", agency: "ARES" }],
    excluded_activities: [],
    lines: Array.from({ length: lineCount }, (_, i) => ({ at: at(9, i), text: `Line ${i + 1}`, source: null })),
    dismissed: [],
  });

  it("splits the log into pages of 24 lines, numbered, always at least one", () => {
    expect(form214Pages(log(0))).toHaveLength(1);
    const pages = form214Pages(log(ICS214_LOG_ROWS + 1));
    expect(pages).toHaveLength(2);
    const second = Object.fromEntries(pages[1].fields);
    expect(second.Page).toBe("2");
    expect(second.Activities1).toBe("Line 25");
    expect(second.Activities2).toBe("");
    expect(second.Incident_Name).toBe("SET 2026");
  });

  it("cuts text to the form's lengths and counts shortened lines", () => {
    const d = log(1);
    d.lines[0].text = "x".repeat(150);
    d.incident_name = "y".repeat(80);
    const [p] = form214Pages(d);
    const f = Object.fromEntries(p.fields);
    expect(f.Activities1).toHaveLength(100);
    expect(f.Activities1.endsWith("...")).toBe(true);
    expect(f.Incident_Name).toHaveLength(55);
    expect(p.shortened).toBe(1);
  });

  it("writes only the form's own field names in the load file", () => {
    const [p] = form214Pages(log(2));
    const keys = Object.keys(JSON.parse(form214LoadFile(p)));
    const formFields = new Set([
      "Incident_Name", "Page", "DateTimeFrom", "DateTimeTo", "Name", "ICS_Position", "Home_Agency", "PreparedName",
      ...Array.from({ length: 8 }, (_, i) => [`Name${i + 1}`, `ICS_Position${i + 1}`, `Home_Agency${i + 1}`]).flat(),
      ...Array.from({ length: 24 }, (_, i) => [`ActivityDateTime${i + 1}`, `Activities${i + 1}`]).flat(),
    ]);
    expect(keys.filter((k) => !formFields.has(k))).toEqual([]);
    expect(keys).toHaveLength(formFields.size);
  });

  it("names the ICS 214 viewer and template in the form data, and builds Winlink's subject", () => {
    const [p] = form214Pages(log(1));
    const xml = form214Xml(p, "K4NCS");
    expect(xml).toContain("<display_form>ICS214_Viewer.html</display_form>");
    expect(xml).toContain("<Templateversion>ICS 214 v 17.10</Templateversion>");
    expect(xml).toContain("<Activities1>Line 1</Activities1>");
    expect(form214Message(p, "K4NCS").subject).toBe(
      "214- SET 2026 - Pat Jones K4NCS-2026-10-03 09:00 - 2026-10-03 12:00"
    );
  });
});
