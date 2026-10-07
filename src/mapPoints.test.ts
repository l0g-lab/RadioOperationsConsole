import { describe, expect, it } from "vitest";
import { netControlPoint, repeaterPoint } from "./mapPoints";
import type { Activity, Operator } from "./types";

const activity = (o: Partial<Activity> = {}) =>
  ({ title: "Tuesday Net", location_lat: null, location_lon: null, location_label: "", repeater_lat: null, repeater_lon: null, repeater_name: "", ...o }) as Activity;
const operator = { display_name: "Pat", location_lat: 28.5, location_lon: -81.4, location_label: "" } as Operator;

describe("map points", () => {
  it("puts net control at the activity's location, else the operator's", () => {
    expect(netControlPoint(activity({ location_lat: 28.6, location_lon: -81.2 }), operator)).toEqual({
      lat: 28.6,
      lon: -81.2,
      label: "Tuesday Net",
    });
    expect(netControlPoint(activity(), operator)).toEqual({ lat: 28.5, lon: -81.4, label: "Pat" });
    expect(netControlPoint(activity(), null)).toBeNull();
  });

  it("marks the repeater only when it has a point", () => {
    expect(repeaterPoint(activity())).toBeNull();
    expect(repeaterPoint(activity({ repeater_lat: 28.54, repeater_lon: -81.38 }))?.label).toBe("the repeater");
  });
});
