import { describe, expect, it } from "vitest";
import type { Activity, Checkin } from "./types";
import { adifContacts, checkinsToAdif, frequencyMhz, guessMode, needsMode } from "./adif";

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
    name: "Al",
    qth_location: "Miami, FL",
    grid_square: "EL95",
    address: "",
    checked_in_at: "2026-09-21T23:04:05Z",
    location_lat: null,
    location_lon: null,
    location_label: "",
    location_manual: false,
    location_how: "",
    has_traffic: false,
    traffic: "",
    traffic_handled: false,
    traffic_message_id: "",
    traffic_status: "",
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

const NOW = new Date("2026-10-13T12:00:00Z");
const records = (adif: string) => adif.split("<EOH>")[1].trim().split("\n").filter(Boolean);

describe("guessMode", () => {
  it("is FM from 30 MHz up and SSB below", () => {
    expect(guessMode("146.940")).toBe("FM");
    expect(guessMode("442.100+ PL 100")).toBe("FM");
    expect(guessMode("3.975")).toBe("SSB");
    expect(guessMode("7250")).toBe("SSB");
  });

  it("takes a mode written with the frequency", () => {
    expect(guessMode("3.975 LSB")).toBe("LSB");
    expect(guessMode("145.330 D-STAR")).toBe("D-STAR");
    expect(guessMode("Fusion room 12345")).toBe("C4FM");
  });

  it("guesses nothing from a name with no frequency", () => {
    expect(guessMode("NI4CE")).toBe("");
    expect(guessMode("")).toBe("");
  });
});

describe("frequencyMhz", () => {
  it("reads kHz only when that's what lands in a band", () => {
    expect(frequencyMhz("7250")).toBe(7.25);
    expect(frequencyMhz("1296.1")).toBe(1296.1);
    expect(frequencyMhz("146.52")).toBe(146.52);
    expect(frequencyMhz("Ch 3")).toBeNull();
    expect(frequencyMhz("NI4CE")).toBeNull();
    expect(frequencyMhz("K4XYZ 147.000+")).toBe(147);
  });
});

describe("adifContacts", () => {
  it("leaves out net control's own entry and blank calls", () => {
    const list = [
      checkin({ id: "1", call_sign: "W4NCS", station_kind: "net_control" }),
      checkin({ id: "2", call_sign: "w4me" }),
      checkin({ id: "3", call_sign: " " }),
      checkin({ id: "4", call_sign: "K4ABC" }),
    ];
    expect(adifContacts(list, "W4ME").map((c) => c.id)).toEqual(["4"]);
  });

  it("needs a mode chosen only when a contact has none", () => {
    expect(needsMode([checkin({ mode: "FM" })])).toBe(false);
    expect(needsMode([checkin({ mode: "FM" }), checkin()])).toBe(true);
  });
});

describe("checkinsToAdif", () => {
  it("writes a header and one record per contact", () => {
    const adif = checkinsToAdif(activity(), [checkin()], "W4NCS", "FM", NOW);
    expect(adif).toMatch(/^ADIF export from Radio Operations Console: Tuesday Net\n/);
    expect(adif).toContain("<ADIF_VER:5>3.1.4");
    expect(adif).toContain("<CREATED_TIMESTAMP:15>20261013 120000 <EOH>");
    expect(records(adif)).toEqual([
      "<CALL:5>K4ABC <QSO_DATE:8>20260921 <TIME_ON:6>230405 <FREQ:6>146.94 <BAND:2>2m " +
        "<MODE:2>FM <NAME:2>Al <QTH:9>Miami, FL <GRIDSQUARE:4>EL95 <COMMENT:11>Tuesday Net " +
        "<STATION_CALLSIGN:5>W4NCS <OPERATOR:5>W4NCS <EOR>",
    ]);
  });

  it("uses a contact's own frequency, mode and reports over the activity's", () => {
    const adif = checkinsToAdif(
      activity({ activity_type: "station_log", frequency: "146.520", location_lat: 25.77, location_lon: -80.19 }),
      [checkin({ frequency: "7.250", mode: "lsb", rst_sent: "59", rst_received: "57", power: "100 W", notes: "Good copy" })],
      "",
      "FM",
      NOW
    );
    const [r] = records(adif);
    expect(r).toContain("<FREQ:4>7.25 <BAND:3>40m <MODE:3>SSB <SUBMODE:3>LSB");
    expect(r).toContain("<RST_SENT:2>59 <RST_RCVD:2>57 <TX_PWR:3>100");
    // A station log's title isn't a net's name, so only the notes are kept.
    expect(r).toContain("<COMMENT:9>Good copy");
    expect(r).toContain("<MY_GRIDSQUARE:6>EL95vs");
    expect(r).not.toContain("STATION_CALLSIGN");
  });

  it("keeps a mode ADIF has no name for in the comment, not MODE", () => {
    const [r] = records(checkinsToAdif(activity(), [checkin({ mode: "Winlink" })], "", "FM", NOW));
    expect(r).not.toContain("<MODE:");
    expect(r).toContain("<COMMENT:27>Tuesday Net - Mode: Winlink");
  });

  it("writes plain ASCII on one line, counting what's written", () => {
    const [r] = records(
      checkinsToAdif(activity(), [checkin({ name: "José", notes: "Mobile\nI-75 🚗" })], "", "FM", NOW)
    );
    expect(r).toContain("<NAME:4>Jose");
    expect(r).toContain("<COMMENT:25>Tuesday Net - Mobile I-75");
  });

  it("gives no band for a non-amateur service or no frequency", () => {
    const gmrs = records(checkinsToAdif(activity({ frequency: "462.600" }), [checkin()], "", "FM", NOW))[0];
    expect(gmrs).toContain("<FREQ:5>462.6");
    expect(gmrs).not.toContain("<BAND:");
    const none = records(checkinsToAdif(activity({ frequency: "" }), [checkin({ grid_square: "nope" })], "", "FM", NOW))[0];
    expect(none).not.toContain("<FREQ:");
    expect(none).not.toContain("<GRIDSQUARE:");
  });
});
