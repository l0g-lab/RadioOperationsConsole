import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "./types";
import { changes, describeHistory, historyPlain } from "./historyText";
import { callOf, dayLabel } from "./components/tabs/HistoryTab";

function entry(entity_type: string, action: string, data: unknown, o: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: "h1",
    entity_type,
    entity_id: "x",
    action,
    data: typeof data === "string" ? data : JSON.stringify(data),
    operator: "Logan (W0LAB)",
    created_at: "2026-10-05T23:57:44Z",
    subject: "",
    activity_id: "",
    activity_title: "",
    ...o,
  };
}

const say = (e: HistoryEntry, ops: Record<string, string> = {}) => historyPlain(describeHistory(e, (id) => ops[id] ?? null));

describe("describeHistory (AUDIT-020)", () => {
  it("says what happened to a net", () => {
    const net = { subject: "Tuesday Net" };
    expect(say(entry("activity", "started", { from: "scheduled", to: "active" }, net))).toBe("Started Tuesday Net");
    expect(say(entry("activity", "closed", {}, net))).toBe("Ended Tuesday Net");
    expect(say(entry("activity", "reopened", { reason: "late check-in" }, net))).toBe(
      "Reopened Tuesday Net — “late check-in”"
    );
    expect(
      say(
        entry(
          "activity",
          "correct",
          { before: { title: "GMRS", frequency: "", activity_type: "simple_net" }, after: { title: "GMRS net", frequency: null, activity_type: "directed_net" } },
          net
        )
      )
    ).toBe("Edited Tuesday Net: title “GMRS” → “GMRS net”, type “Simple net” → “Directed net”");
    expect(say(entry("activity", "set_event", { before: "", after: "ARRL 2026 SET" }, net))).toBe(
      "Put Tuesday Net in the event ARRL 2026 SET"
    );
    expect(say(entry("activity", "set_event", { before: "ARRL 2026 SET", after: null }, net))).toBe(
      "Took Tuesday Net out of the event ARRL 2026 SET"
    );
    expect(say(entry("activity", "change_operator", { from: "o1", to: "o2" }, net), { o1: "W0LAB", o2: "WRMN479" })).toBe(
      "Changed who runs Tuesday Net from W0LAB to WRMN479"
    );
  });

  it("names something since deleted from its own data", () => {
    expect(say(entry("activity", "delete_permanently", { title: "urg net", checkins: 0, relay_messages: 0, spotter_reports: 0 }))).toBe(
      "Deleted urg net"
    );
    expect(say(entry("activity", "delete_permanently", { title: "Old net", checkins: 3, spotter_reports: 1 }))).toBe(
      "Deleted Old net and its 3 check-ins, 1 spotter report"
    );
    expect(say(entry("event", "delete", { name: "ARRL 2027 SET" }))).toBe("Deleted the event ARRL 2027 SET");
  });

  it("says what happened to a check-in, a report, and a relayed message", () => {
    const call = { subject: "K4KKC" };
    expect(say(entry("checkin", "traffic_handled", { handled: true }, call))).toBe("Marked K4KKC's traffic handled");
    expect(say(entry("checkin", "traffic_handled", { handled: false }, call))).toBe("Marked K4KKC's traffic not handled");
    expect(say(entry("checkin", "void", { reason: "duplicate" }, call))).toBe("Removed K4KKC's check-in — “duplicate”");
    expect(
      say(entry("checkin", "correct", { before: { name: "Al", contact: { power: "" } }, after: { name: "Al Smith", contact: { power: "5 W" } } }, call))
    ).toBe("Edited K4KKC's check-in: name “Al” → “Al Smith”, power “none” → “5 W”");
    expect(say(entry("spotter_report", "void", { reason: null }, { subject: "Hail from W4ABC" }))).toBe(
      "Removed the spotter report Hail from W4ABC"
    );
    const msg = { subject: "wrmr677 for Monroe" };
    expect(say(entry("relay_message", "relay_passed", { station: "Monroe", via: "7.188" }, msg))).toBe(
      "Passed the message wrmr677 for Monroe to Monroe via 7.188"
    );
    expect(say(entry("relay_message", "relay_attempt", { station: "", via: "7.240", note: "No contact" }, msg))).toBe(
      "Tried to pass the message wrmr677 for Monroe via 7.240 — “No contact”"
    );
    expect(say(entry("relay_message", "create", { from_station: "k4kkc", for_station: "MDEOC", received_via: "Phone" }))).toBe(
      "Logged the message k4kkc for MDEOC received via Phone"
    );
  });

  it("says what happened to the directory and operators", () => {
    expect(say(entry("repeater", "create", { after: { name: "W4URG" } }, { subject: "W4URG" }))).toBe("Added the repeater W4URG");
    expect(say(entry("repeater", "retire", "", { subject: "W4URG" }))).toBe("Retired the repeater W4URG");
    expect(say(entry("net_listing", "create", { after: { name: "test net" } }))).toBe("Added the net listing test net");
    expect(say(entry("place", "create", { after: { name: "URGARC HQ" } }, { subject: "URGARC HQ" }))).toBe("Added the place URGARC HQ");
    expect(
      say(entry("operator", "correct", { before: { call_sign: "W0LAB" }, after: { call_sign: "W0LAB / WRMN479" } }, { subject: "Logan" }))
    ).toBe("Edited the operator Logan: call sign “W0LAB” → “W0LAB / WRMN479”");
  });

  it("still says something readable for anything it doesn't know", () => {
    expect(say(entry("widget", "spun_round", "", { subject: "Thing" }))).toBe("spun round (widget) Thing");
  });
});

describe("changes", () => {
  it("lists what changed, leaving out long values, and caps the list", () => {
    expect(changes({ notes: "a".repeat(50) }, { notes: "b" })).toBe("notes");
    expect(changes({ lat: 1, lon: 2 }, { lat: 3, lon: 4 })).toBe("map position");
    expect(changes({ title: "a", name: "b", mode: "FM", power: "1" }, { title: "b", name: "c", mode: "DMR", power: "2" })).toBe(
      "title “a” → “b”, name “b” → “c”, mode “FM” → “DMR” and 1 more"
    );
    expect(changes({ title: "same" }, { title: "same" })).toBe("");
  });
});


describe("History tab labels", () => {
  it("shows who by call sign, and days as Today, Yesterday, or the date", () => {
    expect(callOf("Logan (W0LAB / WRMN479)")).toBe("W0LAB / WRMN479");
    expect(callOf("Pat")).toBe("Pat");
    const now = new Date(2026, 9, 5, 20, 0);
    expect(dayLabel(new Date(2026, 9, 5, 8, 0), now)).toBe("Today · Mon 10/5");
    expect(dayLabel(new Date(2026, 9, 4, 23, 0), now)).toBe("Yesterday · Sun 10/4");
    expect(dayLabel(new Date(2026, 9, 1), now)).toBe("Thu 10/1");
    expect(dayLabel(new Date(2025, 11, 30), now)).toBe("Tue 12/30/2025");
  });
});
