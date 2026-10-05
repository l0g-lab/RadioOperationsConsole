import { describe, expect, it } from "vitest";
import { earlierEntries } from "./SuggestInput";

const values = (typed: string, entries: string[]) => earlierEntries(typed, entries).map((s) => s.value);

describe("earlierEntries", () => {
  const named = ["EOC", "Shelter 2", "W4ABC", "Red Cross Shelter", "eoc", ""];

  it("puts entries starting with what's typed before those with a later word starting with it", () => {
    expect(values("sh", named)).toEqual(["Shelter 2", "Red Cross Shelter"]);
    expect(values("e", named)).toEqual(["EOC"]);
  });

  it("lists each entry once, as first written", () => {
    expect(values("eo", ["EOC", "eoc", " EOC "])).toEqual(["EOC"]);
  });

  it("offers nothing for an empty box or one already holding an entry", () => {
    expect(values(" ", named)).toEqual([]);
    expect(values("eoc", named)).toEqual([]);
    expect(values("xyz", named)).toEqual([]);
  });

  it("offers at most eight", () => {
    expect(values("s", Array.from({ length: 12 }, (_, i) => `Shelter ${i}`))).toHaveLength(8);
  });
});
