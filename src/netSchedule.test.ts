import { describe, expect, it } from "vitest";
import { comingUp, describeSchedule, meetsOn, monthlyWeeks, nextMeeting, startsIn, weekView } from "./netSchedule";
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

describe("weekView (NETL-020)", () => {
  const ids = (entries: { listing: NetListing }[]) => entries.map((e) => e.listing.id);
  const LISTINGS = [
    listing({ id: "weekdays", name: "Weekday Net", weekdays: [1, 2, 3, 4, 5], start_time: "07:00", end_time: "07:30" }),
    listing({ id: "now", name: "Monday Net", weekdays: [1] }),
    listing({ id: "late", name: "Late Net", weekdays: [1, 3], start_time: "21:00", end_time: "" }),
  ];

  it("is Sunday to Saturday whatever the day, each net under every weekday it meets, by time", () => {
    const monday = weekView(LISTINGS, at(5, 19, 10)); // Monday 19:10
    const friday = weekView(LISTINGS, at(9, 12)); // Friday noon
    for (const week of [monday, friday]) {
      expect(week.days.map((d) => d.name)).toEqual([
        "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
      ]);
      expect(ids(week.days[1].entries)).toEqual(["weekdays", "now", "late"]);
      expect(ids(week.days[3].entries)).toEqual(["weekdays", "late"]);
      expect(week.days[0].entries).toEqual([]);
    }
    expect(monday.days.map((d) => d.today)).toEqual([false, true, false, false, false, false, false]);
    expect(friday.days[5].today).toBe(true);
  });

  it("keeps today's nets, marking those over and under way, each at its next meeting on that weekday", () => {
    const week = weekView(LISTINGS, at(5, 19, 10)); // Monday 19:10
    const [over, now, late] = week.days[1].entries;
    expect(over.overToday).toBe(true);
    expect(over.meeting?.start).toEqual(at(12, 7, 0)); // next Monday
    expect(now.overToday).toBe(false);
    expect(now.meeting?.underway).toBe(true);
    expect(late.meeting?.start).toEqual(at(5, 21, 0));
    expect(week.days[3].entries[0].meeting?.start).toEqual(at(7, 7, 0)); // Wednesday
  });

  it("lists monthly nets under their weekday, and as needed apart by name", () => {
    const week = weekView(
      [
        listing({ id: "b", name: "Bravo", schedule_kind: "as_needed" }),
        listing({ id: "last-sun", schedule_kind: "monthly", weekdays: [0], weeks: ["last"] }),
        listing({ id: "a", name: "alpha", schedule_kind: "as_needed" }),
      ],
      at(2, 9) // Friday, October 2
    );
    expect(ids(week.days[0].entries)).toEqual(["last-sun"]);
    expect(week.days[0].entries[0].meeting?.start).toEqual(at(25, 19, 0));
    expect(week.asNeeded.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("names a monthly net's weeks", () => {
    expect(monthlyWeeks(listing({ schedule_kind: "monthly", weeks: ["2", "4"] }))).toBe("2nd & 4th");
    expect(monthlyWeeks(listing({ schedule_kind: "monthly", weeks: ["last"] }))).toBe("last");
    expect(monthlyWeeks(listing())).toBe("");
  });
});

describe("describing (NETL-021)", () => {
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

describe("coming up (NETL-025)", () => {
  const now = at(2, 9); // Friday 09:00

  it("lists the nets on now or within 12 hours, each once, soonest first", () => {
    const listings = [
      listing({ id: "am", name: "Morning Net", weekdays: [1, 2, 3, 4, 5], start_time: "08:30", end_time: "09:30" }),
      listing({ id: "tue" }),
      listing({ id: "sat", name: "Saturday Net", weekdays: [6], start_time: "10:00" }),
      listing({ id: "mon", name: "Monthly Net", schedule_kind: "monthly", weekdays: [4], weeks: ["2"], start_time: "20:00" }),
    ];
    // Friday 09:00: the Morning Net is on; Saturday's 10:00 is 25 hours off.
    expect(comingUp(listings, now).map((e) => e.listing.id)).toEqual(["am"]);
    expect(comingUp(listings, now, 26).map((e) => e.listing.id)).toEqual(["am", "sat"]);
  });

  it("says when each starts at a glance", () => {
    const m = (start: Date, end = new Date(start.getTime() + 3_600_000), underway = false) => ({ start, end, underway });
    expect(startsIn(m(at(2, 8, 30), at(2, 9, 30), true), now)).toBe("On now · until 09:30");
    expect(startsIn(m(at(2, 9, 25)), now)).toBe("in 25 min");
    expect(startsIn(m(at(2, 11, 10)), now)).toBe("in 2 h 10 min");
    expect(startsIn(m(at(2, 19)), now)).toBe("in 10 h");
    expect(startsIn(m(at(3, 10)), now)).toBe("Tomorrow 10:00");
    expect(startsIn(m(at(6, 19)), now)).toBe("Tue 19:00");
    expect(startsIn(m(at(15, 20)), now)).toBe("Thu Oct 15 20:00");
  });
});
