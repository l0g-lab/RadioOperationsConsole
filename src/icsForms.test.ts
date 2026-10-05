import { describe, expect, it } from "vitest";
import {
  comms309Entries,
  FORM309_ROWS,
  FORM309_WINLINK_FILENAME,
  form309Data,
  form309Header,
  form309Message,
  form309Pages,
  form309Rows,
  form309Xml,
  ICS213_WINLINK_FILENAME,
  ics213FromReport,
  ics213FromReports,
  ics213Html,
  ics213Message,
  ics213WinlinkXml,
  ics309Html,
  localDate,
  localDateTime,
  localTime,
  spansDays,
  winlinkText,
  type Comms309Entry,
  type Form309Header,
  type GeneralMessage213Input,
} from "./icsForms";
import type { Activity, Checkin, SpotterReport } from "./types";

function checkin(overrides: Partial<Checkin> = {}): Checkin {
  return {
    id: "c1",
    call_sign: "k4abc",
    name: "Al",
    qth_location: "Miami, FL",
    grid_square: "EL95",
    address: "",
    checked_in_at: "2026-09-21T23:04:00Z",
    location_lat: null,
    location_lon: null,
    location_label: "",
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
    event: "",
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

const header: Form309Header = {
  title: "Tue Net",
  task: "",
  taskName: "Tuesday Net",
  preparedAt: "2026-09-21 20:45",
  opPeriod: "20260921",
  opName: "Bob Nelson",
  stationId: "K4NCS",
};

describe("localDate / localTime / localDateTime", () => {
  it("formats a Date's local parts", () => {
    const d = new Date(2026, 8, 21, 19, 4); // month is 0-based: September
    expect(localDate(d)).toBe("2026-09-21");
    expect(localTime(d)).toBe("19:04");
  });

  it("localDateTime combines both from an ISO string, or '' if unparseable", () => {
    expect(localDateTime("2026-09-21T23:04:00Z")).toMatch(/^2026-09-2\d \d{2}:\d{2}$/);
    expect(localDateTime("not a date")).toBe("");
    expect(localDateTime("")).toBe("");
  });
});

describe("winlinkText", () => {
  it("converts smart punctuation to plain ASCII", () => {
    expect(winlinkText("em—dash and en–dash")).toBe("em-dash and en-dash");
    expect(winlinkText("“quoted” and ‘single’")).toBe('"quoted" and \'single\'');
    expect(winlinkText("wait…")).toBe("wait...");
    expect(winlinkText("a b")).toBe("a b");
  });

  it("leaves plain and accented letters alone", () => {
    expect(winlinkText("Café, straße, naïve")).toBe("Café, straße, naïve");
  });
});

describe("comms309Entries", () => {
  it("builds one entry per check-in, addressed to net control, oldest first", () => {
    const entries = comms309Entries(
      [
        checkin({ id: "b", call_sign: "w1xyz", checked_in_at: "2026-09-21T23:10:00Z" }),
        checkin({ id: "a", call_sign: "k4abc", checked_in_at: "2026-09-21T23:04:00Z" }),
      ],
      "K4NCS"
    );
    expect(entries.map((e) => e.from)).toEqual(["K4ABC", "W1XYZ"]);
    expect(entries.every((e) => e.to === "K4NCS")).toBe(true);
    expect(entries[0].at).toBeLessThan(entries[1].at);
  });

  it("skips a check-in with an unparseable time rather than throwing", () => {
    const entries = comms309Entries([checkin({ checked_in_at: "not a date" })], "K4NCS");
    expect(entries).toHaveLength(0);
  });

  it("the message is just the station's traffic", () => {
    const [entry] = comms309Entries(
      [checkin({ has_traffic: true, traffic: "Need generator", traffic_handled: true })],
      "K4NCS"
    );
    expect(entry.message).toBe("Need generator");
  });

  it("the message is blank for a station without traffic", () => {
    const [none, untyped] = comms309Entries(
      [
        checkin({ id: "a", checked_in_at: "2026-09-21T19:00:00Z" }),
        checkin({ id: "b", checked_in_at: "2026-09-21T19:01:00Z", has_traffic: true, traffic: "" }),
      ],
      "K4NCS"
    );
    expect(none.message).toBe("");
    expect(untyped.message).toBe("");
  });
});

describe("spansDays", () => {
  it("false for no entries or entries on one day", () => {
    expect(spansDays([])).toBe(false);
    const oneDay: Comms309Entry[] = [
      { at: new Date(2026, 8, 21, 9, 0).getTime(), from: "", to: "", message: "" },
      { at: new Date(2026, 8, 21, 23, 0).getTime(), from: "", to: "", message: "" },
    ];
    expect(spansDays(oneDay)).toBe(false);
  });

  it("true when entries fall on different local days", () => {
    const twoDays: Comms309Entry[] = [
      { at: new Date(2026, 8, 21, 23, 0).getTime(), from: "", to: "", message: "" },
      { at: new Date(2026, 8, 22, 1, 0).getTime(), from: "", to: "", message: "" },
    ];
    expect(spansDays(twoDays)).toBe(true);
  });
});

describe("form309Header: field-length limits (Winlink's Form-309)", () => {
  it("clips each field to the form's limit, marking a cut with an ellipsis", () => {
    const clipped = form309Header({
      title: "  Untouched Title  ",
      task: "12345678", // > 7
      taskName: "x".repeat(60), // > 50
      preparedAt: "2026-09-21 20:45:00 extra", // > 18
      opPeriod: "x".repeat(20), // > 15
      opName: "x".repeat(40), // > 35
      stationId: "VERYLONGCALLSIGN", // > 13
    });
    // title is trimmed but not length-limited (it's free text, not a fixed Winlink field).
    expect(clipped.title).toBe("Untouched Title");
    expect(clipped.task).toHaveLength(7);
    expect(clipped.task.endsWith("...")).toBe(true);
    expect(clipped.taskName).toHaveLength(50);
    expect(clipped.preparedAt).toHaveLength(18);
    expect(clipped.opPeriod).toHaveLength(15);
    expect(clipped.opName).toHaveLength(35);
    expect(clipped.stationId).toHaveLength(13);
  });

  it("leaves short values untouched", () => {
    expect(form309Header(header)).toEqual(header);
  });

  it("flattens embedded tabs/newlines and converts smart punctuation", () => {
    const clipped = form309Header({ ...header, opName: "Bob\tNelson—NCS" });
    expect(clipped.opName).toBe("Bob Nelson-NCS");
  });
});

describe("form309Rows", () => {
  it("counts how many entries were shortened to fit the 90-character subject limit", () => {
    const longMessage = "x".repeat(120);
    const { rows, shortened } = form309Rows([
      { at: 0, from: "K4ABC", to: "K4NCS", message: "short" },
      { at: 1, from: "K4ABC", to: "K4NCS", message: longMessage },
    ]);
    expect(shortened).toBe(1);
    expect(rows[0].sub).toBe("short");
    expect(rows[1].sub).toHaveLength(90);
  });

  it("clips from/to call signs to 13 characters", () => {
    const { rows } = form309Rows([
      { at: 0, from: "A_VERY_LONG_TACTICAL_CALL", to: "K4NCS", message: "hi" },
    ]);
    expect(rows[0].from).toHaveLength(13);
  });

  it("always includes the date in the row time (per ICSF-011)", () => {
    const { rows } = form309Rows([{ at: new Date(2026, 8, 21, 19, 4).getTime(), from: "A", to: "B", message: "m" }]);
    expect(rows[0].time).toBe("2026-09-21 19:04");
  });
});

describe("form309Pages", () => {
  it("returns a single, possibly-empty page when there are 30 or fewer rows", () => {
    expect(form309Pages([])).toEqual([[]]);
    const oneRow = [{ time: "t", from: "f", to: "t2", sub: "s" }];
    expect(form309Pages(oneRow)).toEqual([oneRow]);
  });

  it("splits into pages of 30", () => {
    const rows = Array.from({ length: 34 }, (_, i) => ({
      time: `${i}`,
      from: "A",
      to: "B",
      sub: "s",
    }));
    const pages = form309Pages(rows);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(30);
    expect(pages[1]).toHaveLength(4);
  });

  it("splits exactly at a multiple of 30 into full pages with no trailing empty page", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ time: `${i}`, from: "A", to: "B", sub: "s" }));
    const pages = form309Pages(rows);
    expect(pages).toHaveLength(2);
    expect(pages.every((p) => p.length === 30)).toBe(true);
  });
});

describe("form309Data (Winlink's Load/Save Form 309 Data format)", () => {
  it("always writes exactly 30 log lines, padding with empty tab-separated lines", () => {
    const data = form309Data([{ time: "2026-09-21 19:00", from: "K4ABC", to: "K4NCS", sub: "Checked in" }], header);
    const lines = data.split("\n");
    // 30 log lines + 1 header line + trailing empty (trailing \n).
    expect(lines).toHaveLength(32);
    expect(lines[0]).toBe("2026-09-21 19:00\tK4ABC\tK4NCS\tChecked in\t");
    expect(lines[1]).toBe("\t\t\t\t");
    expect(lines[29]).toBe("\t\t\t\t");
  });

  it("writes the header line with Task, TaskName, Prepared, OpPeriod, OpName, StationId, each tab-terminated", () => {
    const data = form309Data([], header);
    const headerLine = data.split("\n")[FORM309_ROWS];
    expect(headerLine).toBe("\tTuesday Net\t2026-09-21 20:45\t20260921\tBob Nelson\tK4NCS\t");
  });
});

describe("form309Message", () => {
  it("builds the subject Winlink's own template produces", () => {
    const { subject } = form309Message([], header, 1, "K4NCS");
    expect(subject).toBe("Form 309- Tue Net - Bob Nelson - K4NCS - 2026-09-21 20:45");
  });

  it("includes the page number and every row in the log body", () => {
    const { body } = form309Message(
      [{ time: "2026-09-21 19:00", from: "K4ABC", to: "K4NCS", sub: "Checked in" }],
      header,
      2,
      "K4NCS"
    );
    expect(body).toContain("PAGE #: 2");
    expect(body).toContain("TIME: 2026-09-21 19:00");
    expect(body).toContain("FROM: K4ABC");
    expect(body).toContain("Checked in");
  });
});

describe("form309Xml (Winlink form data)", () => {
  it("uses the exact filename Winlink Express looks for", () => {
    expect(FORM309_WINLINK_FILENAME).toBe("RMS_Express_Form_Form-309_Viewer.xml");
  });

  it("names the Form-309 viewer and includes every row variable, blank past the data", () => {
    const xml = form309Xml(
      [{ time: "2026-09-21 19:00", from: "K4ABC", to: "K4NCS", sub: "Checked in" }],
      header,
      1,
      "K4NCS"
    );
    expect(xml).toContain("<display_form>Form-309_Viewer.html</display_form>");
    expect(xml).toContain("<Time1>2026-09-21 19:00</Time1>");
    expect(xml).toContain("<From1>K4ABC</From1>");
    expect(xml).toContain("<Time30></Time30>");
    expect(xml).toContain("<OpName>Bob Nelson</OpName>");
    expect(xml).toContain("<Templateversion>Form 309 v13.12</Templateversion>");
  });

  it("is well-formed XML", () => {
    const xml = form309Xml([], header, 1, "K4NCS");
    expect(() => new DOMParser().parseFromString(xml, "application/xml")).not.toThrow();
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(doc.documentElement.tagName).toBe("RMS_Express_Form");
  });

  it("escapes special characters in values", () => {
    const xml = form309Xml([], { ...header, title: "A & B <test>" }, 1, "K4NCS");
    expect(xml).toContain("A &amp; B &lt;test&gt;");
    expect(xml).not.toContain("<test>");
  });
});

describe("ics309Html", () => {
  const input = {
    incidentName: "Tue Net",
    periodFrom: "a",
    periodTo: "b",
    netName: "Tue Net",
    operatorName: "Bob",
    operatorCall: "K4NCS",
    preparedByName: "Bob",
    preparedByPosition: "NCS",
    preparedAt: "now",
    entries: [] as Comms309Entry[],
  };

  it("says so when there are no entries, rather than an empty table", () => {
    const html = ics309Html(input);
    expect(html).toContain("No communications recorded.");
  });

  it("renders one row per entry with escaped content", () => {
    const html = ics309Html({
      ...input,
      entries: [{ at: Date.now(), from: "K4ABC", to: "K4NCS", message: "<script>bad</script>" }],
    });
    expect(html).toContain("K4ABC");
    expect(html).not.toContain("<script>bad</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("is a full HTML document naming the incident in the title", () => {
    const html = ics309Html(input);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("<title>ICS 309 — Tue Net</title>");
  });
});

describe("ics213Html", () => {
  const input: GeneralMessage213Input = {
    incidentName: "Tue Net",
    toName: "Duty Officer",
    toPosition: "NWS",
    fromName: "Bob",
    fromPosition: "",
    subject: "Test message",
    date: "2026-09-21",
    time: "19:00",
    message: "Line one\nLine two",
    approvedName: "Bob",
    approvedPosition: "",
  };

  it("keeps line breaks in the message as <br>", () => {
    const html = ics213Html(input);
    expect(html).toContain("Line one<br>Line two");
  });

  it("joins name and position with a slash", () => {
    const html = ics213Html(input);
    expect(html).toContain("Duty Officer / NWS");
  });

  it("titles the page by subject, falling back to the incident name", () => {
    expect(ics213Html(input)).toContain("<title>ICS 213 — Test message</title>");
    expect(ics213Html({ ...input, subject: "" })).toContain("<title>ICS 213 — Tue Net</title>");
  });
});

describe("ics213FromReports / ics213FromReport", () => {
  it("ics213FromReports carries every report in the message and counts them in the subject", () => {
    const f = ics213FromReports(activity(), [report(), report({ id: "r2", hazard_type: "Tornado" })], "Bob");
    expect(f.subject).toBe("Spotter reports - Tuesday Net (2)");
    expect(f.message).toContain("Hail");
    expect(f.message).toContain("Tornado");
    expect(f.fromName).toBe("Bob");
    expect(f.toName).toBe(""); // left for the operator
  });

  it("ics213FromReport names the hazard and magnitude in the subject", () => {
    const f = ics213FromReport(activity(), report(), "Bob");
    expect(f.subject).toBe("Spotter report: Hail 1.00 in");
    expect(f.date).toBe("2026-09-21");
  });

  it("ics213FromReport falls back to now() if the report's time can't be parsed", () => {
    const f = ics213FromReport(activity(), report({ reported_at: "garbage" }), "Bob");
    expect(f.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("ics213WinlinkXml", () => {
  const input: GeneralMessage213Input = {
    incidentName: "Tue Net",
    toName: "Duty Officer",
    toPosition: "NWS",
    fromName: "Bob",
    fromPosition: "NCS",
    subject: "Test",
    date: "2026-09-21",
    time: "19:00",
    message: "line1\tline2",
    approvedName: "Bob",
    approvedPosition: "",
  };

  it("uses the exact ICS-213 filename Winlink Express expects", () => {
    expect(ICS213_WINLINK_FILENAME).toBe("RMS_Express_Form_ICS213_Initial_Viewer.xml");
  });

  it("joins name and position for the single To/From fields", () => {
    const xml = ics213WinlinkXml(input, "K4NCS");
    expect(xml).toContain("<to_name>Duty Officer / NWS</to_name>");
    expect(xml).toContain("<fm_name>Bob / NCS</fm_name>");
  });

  it("names the ICS213 viewer and carries the sender's call sign", () => {
    const xml = ics213WinlinkXml(input, "K4NCS");
    expect(xml).toContain("<display_form>ICS213_Initial_Viewer.html</display_form>");
    expect(xml).toContain("<senders_callsign>K4NCS</senders_callsign>");
    expect(xml).toContain("<msgsender>K4NCS</msgsender>");
  });

  it("mirrors the message into Message2 with tabs turned into pipes", () => {
    const xml = ics213WinlinkXml(input, "K4NCS");
    expect(xml).toContain("<Message2>line1|line2</Message2>");
  });

  it("includes every optional field the ICS213 viewer reads, even when empty", () => {
    const xml = ics213WinlinkXml(input, "K4NCS");
    for (const tag of ["ShowDR", "FormTitle", "IsExercise", "mapLat", "mapLon", "MGRS", "locationSource"]) {
      expect(xml).toContain(`<${tag}></${tag}>`);
    }
  });

  it("is well-formed XML", () => {
    const xml = ics213WinlinkXml(input, "K4NCS");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  });
});

describe("ics213Message", () => {
  it("builds a readable subject and body with the sending station credited", () => {
    const f: GeneralMessage213Input = {
      incidentName: "Tue Net",
      toName: "",
      toPosition: "",
      fromName: "Bob",
      fromPosition: "",
      subject: "Test",
      date: "2026-09-21",
      time: "19:00",
      message: "hello",
      approvedName: "Bob",
      approvedPosition: "",
    };
    const { subject, body } = ics213Message(f, "K4NCS");
    expect(subject).toBe("ICS-213: Test - 2026-09-21 19:00");
    expect(body).toContain("hello");
    expect(body).toContain("Express Sending Station: K4NCS");
  });
});
