import { describe, expect, it } from "vitest";
import { describeNext, describeSchedule, meetsOn, nextMeeting, weekAhead } from "./netSchedule";
import type { NetListing } from "./types";

function listing(overrides: Partial<NetListing> = {}): NetListing {
  return {
    id: "n1",
    name: "Tuesday Night Net",
    activity_type: "directed_net",
    repeater_id: null,
    frequency: "146.940",
    schedule_kind: "weekly",
    weekdays: [2],
    weeks: [],
    start_time: "19:00",
    end_time: "19:30",
    checkin_info: "",
    run_by: "",
    notes: "",
    retired_at: "",
    ...overrides,
  };
}

/** Local time; October 2026 Thursdays are the 1st, 8th, 15th, 22nd and 29th. */
const at = (day: number, h = 12, m = 0, month = 9) => new Date(2026, month, day, h, m);

describe("nextMeeting (NETL-003, NETL-004, NETL-020)", () => {
  it("finds the next weekly meeting", () => {
    // Friday, October 2 → Tuesday, October 6.
    const m = nextMeeting(listing(), at(2))!;
    expect(m.start).toEqual(at(6, 19, 0));
    expect(m.end).toEqual(at(6, 19, 30));
    expect(m.underway).toBe(false);
  });

  it("is under way between start and end, then moves to next week", () => {
    expect(nextMeeting(listing(), at(6, 19, 10))!.underway).toBe(true);
    expect(nextMeeting(listing(), at(6, 19, 30))!.start).toEqual(at(13, 19, 0));
  });

  it("counts a net with no end time as under way for an hour", () => {
    const l = listing({ end_time: "" });
    expect(nextMeeting(l, at(6, 19, 59))!.underway).toBe(true);
    expect(nextMeeting(l, at(6, 20, 0))!.start).toEqual(at(13, 19, 0));
  });

  it("finds monthly meetings by week, skipping a 5th week", () => {
    const l = listing({ schedule_kind: "monthly", weekdays: [4], weeks: ["2", "4"], start_time: "20:00", end_time: "" });
    expect(nextMeeting(l, at(2))!.start).toEqual(at(8, 20, 0));
    expect(nextMeeting(l, at(9))!.start).toEqual(at(22, 20, 0));
    // After the 4th Thursday, not the 29th (a 5th Thursday): November's 2nd, the 12th.
    expect(nextMeeting(l, at(23))!.start).toEqual(at(12, 20, 0, 10));
  });

  it("finds the last weekday of the month", () => {
    const l = listing({ schedule_kind: "monthly", weekdays: [4], weeks: ["last"] });
    expect(meetsOn(l, at(29))).toBe(true);
    expect(meetsOn(l, at(22))).toBe(false);
    // February 2026's last Thursday is the 26th, its 4th.
    expect(meetsOn(l, new Date(2026, 1, 26))).toBe(true);
  });

  it("has no next meeting when as needed", () => {
    expect(nextMeeting(listing({ schedule_kind: "as_needed", weekdays: [], start_time: "" }), at(2))).toBeNull();
  });
});

describe("weekAhead (NETL-020)", () => {
  const ids = (entries: { listing: NetListing }[]) => entries.map((e) => e.listing.id);

  it("lists each day's nets by start time, under every day they meet", () => {
    const now = at(5, 19, 10); // Monday 19:10
    const week = weekAhead(
      [
        listing({ id: "weekdays", name: "Weekday Net", weekdays: [1, 2, 3, 4, 5], start_time: "07:00", end_time: "07:30" }),
        listing({ id: "now", name: "Monday Net", weekdays: [1] }),
        listing({ id: "late", name: "Late Net", weekdays: [1, 3], start_time: "21:00", end_time: "" }),
      ],
      now
    );
    expect(week.days.map((d) => d.label)).toEqual([
      "Today · Mon Oct 5",
      "Tomorrow · Tue Oct 6",
      "Wed Oct 7",
      "Thu Oct 8",
      "Fri Oct 9",
      "Sat Oct 10",
      "Sun Oct 11",
    ]);
    // Today: the 07:00 net is over; the one under way comes first.
    expect(ids(week.days[0].entries)).toEqual(["now", "late"]);
    expect(week.days[0].entries[0].meeting.underway).toBe(true);
    expect(ids(week.days[2].entries)).toEqual(["weekdays", "late"]);
    expect(week.days[5].entries).toEqual([]);
  });

  it("puts nets that don't meet this week under later, and as needed last by name", () => {
    const now = at(2, 9); // Friday, October 2
    const week = weekAhead(
      [
        listing({ id: "b", name: "Bravo", schedule_kind: "as_needed" }),
        listing({ id: "last-sun", schedule_kind: "monthly", weekdays: [0], weeks: ["last"] }),
        listing({ id: "a", name: "alpha", schedule_kind: "as_needed" }),
        listing({ id: "2nd-thu", schedule_kind: "monthly", weekdays: [4], weeks: ["2"] }),
      ],
      now
    );
    // The 2nd Thursday (October 8) is within the week; the last Sunday (the 25th) isn't.
    expect(ids(week.days[6].entries)).toEqual(["2nd-thu"]);
    expect(ids(week.later)).toEqual(["last-sun"]);
    expect(week.later[0].meeting.start).toEqual(at(25, 19, 0));
    expect(week.asNeeded.map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("describing (NETL-021)", () => {
  const now = at(2, 9); // Friday morning

  it("says when a net next meets in plain terms", () => {
    expect(describeNext({ start: at(2, 19), end: at(2, 20), underway: false }, now)).toBe("Today 19:00");
    expect(describeNext({ start: at(3, 8, 30), end: at(3, 9), underway: false }, now)).toBe("Tomorrow 08:30");
    expect(describeNext({ start: at(8, 20), end: at(8, 21), underway: false }, now)).toBe("Thu Oct 8, 20:00");
    expect(describeNext({ start: at(2, 8), end: at(2, 9, 30), underway: true }, now)).toBe("Under way until 09:30");
  });

  it("describes schedules", () => {
    expect(describeSchedule(listing())).toBe("Tuesdays 19:00–19:30");
    expect(describeSchedule(listing({ weekdays: [1, 2, 3, 4, 5], end_time: "" }))).toBe("Mon–Fri 19:00");
    expect(describeSchedule(listing({ weekdays: [1, 3, 5], end_time: "" }))).toBe("Mon, Wed, Fri 19:00");
    expect(
      describeSchedule(listing({ schedule_kind: "monthly", weekdays: [4], weeks: ["2", "4"], start_time: "20:00", end_time: "" }))
    ).toBe("2nd & 4th Thursday 20:00");
    expect(describeSchedule(listing({ schedule_kind: "monthly", weekdays: [0], weeks: ["last"], end_time: "" }))).toBe(
      "Last Sunday 19:00"
    );
    expect(describeSchedule(listing({ schedule_kind: "as_needed" }))).toBe("As needed");
  });
});
