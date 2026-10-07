import { describe, expect, it } from "vitest";
import { describeImport } from "./ShareListControls";

const summary = { total: 0, new: 0, already_here: 0, unreadable: 0, exported_at: "2026-10-07T12:00:00Z" };

describe("describeImport", () => {
  it("says what an import adds and what it leaves", () => {
    expect(describeImport("nets", { ...summary, total: 6, new: 3, already_here: 2, unreadable: 1 })).toBe(
      "Adds 3 nets. 2 already here are left as they are. 1 couldn't be read and is skipped."
    );
    expect(describeImport("repeaters", { ...summary, total: 2, new: 1, already_here: 1 }, true)).toBe(
      "Added 1 repeater. 1 already here is left as it is."
    );
  });

  it("says when there's nothing new", () => {
    expect(describeImport("repeaters", { ...summary, total: 4, already_here: 4 })).toBe(
      "Nothing new: all 4 repeaters are already here."
    );
    expect(describeImport("nets", summary)).toBe("Nothing new: the file has no nets.");
  });
});
