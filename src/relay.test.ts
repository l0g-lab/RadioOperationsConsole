import { describe, expect, it } from "vitest";
import type { RelayMessage, RelayStep } from "./types";
import { relay214Lines, relay309Entries } from "./relay";
import { relayMessagesToCsv, parseCsv } from "./export";
import { visibleSections } from "./activityTypes";
import { summaryFacts } from "./summaryFacts";

const step = (id: string, kind: RelayStep["kind"], at: string, extra: Partial<RelayStep> = {}): RelayStep => ({
  id,
  kind,
  at,
  station: "",
  via: "",
  note: "",
  ...extra,
});

/** A sitrep that failed on HF, then went by phone; and one given up on. */
function messages(): RelayMessage[] {
  const base = {
    activity_id: "a1",
    received_via: "146.940",
    reply_to: null,
    voided_at: "",
    void_reason: "",
  };
  return [
    {
      ...base,
      id: "m1",
      received_at: "2026-10-03T14:00:00Z",
      from_station: "Shelter 2",
      for_station: "EOC",
      message: "40 occupants, need cots",
      status: "passed",
      steps: [
        step("s1", "attempt", "2026-10-03T14:10:00Z", { via: "7.240 HF", note: "No contact" }),
        step("s2", "passed", "2026-10-03T14:25:00Z", { station: "EOC", via: "Phone" }),
      ],
    },
    {
      ...base,
      id: "m2",
      received_at: "2026-10-03T15:00:00Z",
      from_station: "EOC",
      for_station: "Shelter 2",
      message: "Cots on the way",
      reply_to: "m1",
      status: "not_passed",
      steps: [step("s3", "not_passed", "2026-10-03T16:00:00Z", { note: "Shelter closed" })],
    },
  ];
}

describe("relay309Entries (RELAY-041)", () => {
  it("logs each message in, each failed attempt, and each passing on, oldest first", () => {
    const e = relay309Entries(messages(), "K4NCS");
    expect(e.map((x) => [x.from, x.to, x.message])).toEqual([
      ["Shelter 2", "K4NCS", "40 occupants, need cots"],
      ["K4NCS", "EOC", "Unable to pass via 7.240 HF: No contact"],
      ["K4NCS", "EOC", "40 occupants, need cots"],
      ["EOC", "K4NCS", "Cots on the way"],
    ]);
  });
});

describe("relay214Lines (RELAY-042)", () => {
  it("describes attempts, passing on, and giving up, within the period", () => {
    const lines = relay214Lines(messages(), "2026-10-03T14:00:00Z", "2026-10-03T23:00:00Z");
    expect(lines.map((l) => [l.source, l.text])).toEqual([
      ["relay:s1", "Unable to relay message from Shelter 2 for EOC via 7.240 HF: No contact"],
      ["relay:s2", "Relayed message from Shelter 2 for EOC via Phone"],
      ["relay:s3", "Message from EOC for Shelter 2 not passed: Shelter closed"],
    ]);
    expect(relay214Lines(messages(), "2026-10-03T14:20:00Z", "2026-10-03T15:00:00Z").map((l) => l.source)).toEqual([
      "relay:s2",
    ]);
  });
});

describe("relayMessagesToCsv (RELAY-040)", () => {
  it("one row per message with its outcome and failed attempts", () => {
    const rows = parseCsv(relayMessagesToCsv(messages()));
    const col = (name: string) => rows[0].indexOf(name);
    expect(rows).toHaveLength(3);
    expect(rows[1][col("Status")]).toBe("Passed");
    expect(rows[1][col("Passed via")]).toBe("Phone");
    expect(rows[1][col("Failed attempts")]).toContain("via 7.240 HF: No contact");
    expect(rows[2][col("Status")]).toBe("Not passed");
    expect(rows[2][col("Not passed because")]).toBe("Shelter closed");
    expect(rows[2][col("Reply to")]).toContain("Shelter 2 to EOC");
  });
});

describe("relay summaries", () => {
  const summary = {
    state: "closed",
    opened_at: "",
    closed_at: "",
    conclusion: "",
    checkins: 0,
    unique_stations: 0,
    removed_checkins: 0,
    first_checkin_at: "",
    last_checkin_at: "",
    spotter_reports: 0,
    hazards: [],
    traffic_items: 0,
    open_traffic_items: 0,
    relay_messages: 5,
    held_relay_messages: 1,
    unpassed_relay_messages: 1,
    largest_hail: "",
    strongest_wind: "",
    counties: [],
    alerts: [],
    weather: [],
  };

  it("a relay station shows its messages, not an empty check-in count", () => {
    const shown = visibleSections("relay", summary);
    expect(shown.has("relay")).toBe(true);
    expect(shown.has("checkins")).toBe(false);
    expect(summaryFacts("relay", summary).map((f) => [f.text, f.detail])).toEqual([
      ["5 relayed messages", "(3 passed, 1 still held, 1 not passed)"],
    ]);
  });
});
