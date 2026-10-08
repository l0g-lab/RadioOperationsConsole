import { describe, expect, it } from "vitest";
import { stormLines, summaryFacts } from "./summaryFacts";
import type { ActivitySummary } from "./types";

function summary(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    state: "active",
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

describe("summaryFacts", () => {
  it("a simple net with no records shows just a check-in count", () => {
    const facts = summaryFacts("simple_net", summary());
    expect(facts).toEqual([{ key: "checkins", text: "0 check-ins", detail: "(0 unique stations)" }]);
  });

  it("singular/plural wording", () => {
    const facts = summaryFacts("simple_net", summary({ checkins: 1, unique_stations: 1 }));
    expect(facts[0]).toEqual({ key: "checkins", text: "1 check-in", detail: "(1 unique station)" });
  });

  it("directed_net includes a traffic fact even with none open", () => {
    const facts = summaryFacts("directed_net", summary({ traffic_items: 2 }));
    const traffic = facts.find((f) => f.key === "traffic");
    expect(traffic).toEqual({ key: "traffic", text: "2 check-ins with traffic", detail: undefined });
  });

  it("flags traffic not yet marked handled", () => {
    const facts = summaryFacts("directed_net", summary({ traffic_items: 2, open_traffic_items: 1 }));
    const traffic = facts.find((f) => f.key === "traffic");
    expect(traffic?.detail).toBe("(1 not marked handled)");
  });

  it("skywarn breaks spotter reports down by hazard", () => {
    const facts = summaryFacts(
      "skywarn",
      summary({
        spotter_reports: 3,
        hazards: [
          { hazard_type: "Hail", count: 2 },
          { hazard_type: "Tornado", count: 1 },
        ],
      })
    );
    const spotter = facts.find((f) => f.key === "spotter");
    expect(spotter).toEqual({
      key: "spotter",
      text: "3 spotter reports",
      detail: "(Hail 2, Tornado 1)",
    });
  });

  it("only includes sections the type emphasizes or that have records", () => {
    const facts = summaryFacts("simple_net", summary());
    expect(facts.map((f) => f.key)).toEqual(["checkins"]);
  });

  it("order is always checkins, then traffic, then spotter", () => {
    const facts = summaryFacts("other", summary({ traffic_items: 1, spotter_reports: 1 }));
    expect(facts.map((f) => f.key)).toEqual(["checkins", "traffic", "spotter"]);
  });
});

describe("stormLines (SPOT-056, SPOT-060)", () => {
  it("adds nothing when there's nothing to say", () => {
    expect(stormLines(summary())).toEqual([]);
  });

  it("gives the largest hail, strongest wind, reports by county, and attached alerts", () => {
    const alert = {
      id: "a1",
      nws_id: "",
      event: "Tornado Watch",
      headline: "",
      area_desc: "",
      severity: "",
      effective: "",
      ends: "",
      attached_at: "",
    };
    const lines = stormLines(
      summary({
        largest_hail: "1.75 in (Golf Ball)",
        strongest_wind: "58-73 mph (Severe Storm) — Severe threshold",
        counties: [
          { county: "Orange", count: 3 },
          { county: "Seminole", count: 1 },
        ],
        alerts: [alert, { ...alert, id: "a2", event: "Tornado Warning" }],
      })
    );
    expect(lines).toEqual([
      { key: "hail", label: "Largest hail", lines: ["1.75 in (Golf Ball)"] },
      { key: "wind", label: "Strongest wind", lines: ["58-73 mph (Severe Storm) — Severe threshold"] },
      { key: "counties", label: "By county", lines: ["Orange 3, Seminole 1"] },
      { key: "alerts", label: "NWS alerts", lines: ["Tornado Watch", "Tornado Warning"] },
    ]);
  });
});
