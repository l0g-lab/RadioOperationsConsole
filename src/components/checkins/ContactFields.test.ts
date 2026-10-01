import { describe, expect, it } from "vitest";
import { modeSuggestions } from "./ContactFields";

describe("modeSuggestions", () => {
  it("offers modes starting with what's typed, ignoring case", () => {
    expect(modeSuggestions("f")).toEqual(["FM", "FT8"]);
    expect(modeSuggestions("D")).toEqual(["DMR", "D-STAR"]);
    expect(modeSuggestions("ss")).toEqual(["SSB"]);
  });

  it("offers nothing for an empty box, a finished mode, or no match", () => {
    expect(modeSuggestions("  ")).toEqual([]);
    expect(modeSuggestions("fm")).toEqual([]);
    expect(modeSuggestions("xyz")).toEqual([]);
  });
});
