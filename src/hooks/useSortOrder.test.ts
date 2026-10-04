import { describe, expect, it } from "vitest";
import { sortByTime } from "./useSortOrder";

describe("sortByTime", () => {
  const items = [
    { id: "b", at: "2026-10-04T10:05:00Z" },
    { id: "a", at: "2026-10-04T10:00:00Z" },
    { id: "c", at: "2026-10-04T10:05:00Z" },
  ];
  it("puts the oldest or newest first, keeping equal times in order", () => {
    expect(sortByTime(items, (x) => x.at, "oldest").map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(sortByTime(items, (x) => x.at, "newest").map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
});
