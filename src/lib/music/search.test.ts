import { describe, expect, it } from "vitest";
import { searchIndex, searchItems } from "./search";

describe("palette search", () => {
  it("ranks drills above the reference page and tells the two scales drills apart", () => {
    const hits = searchItems("scal");
    const at = (label: string) => hits.findIndex((h) => h.label === label);
    expect(at("Scales")).toBeLessThan(at("Chord and scale reference"));
    expect(at("Scales and modes")).toBeLessThan(at("Chord and scale reference"));
    const hint = (label: string) => hits.find((h) => h.label === label)!.hint;
    expect(hint("Scales")).toBe("Technique drill");
    expect(hint("Scales and modes")).toBe("Ear training drill");
  });

  it("puts an exact label first and keyword-only matches last", () => {
    expect(searchItems("progress")[0].label).toBe("Progress");
    const hits = searchItems("tuner");
    expect(hits[0].label).toBe("Tuner");
    // Intonation and Drone only match on their hint.
    expect(hits.slice(1).map((h) => h.label)).toEqual(
      expect.arrayContaining(["Intonation", "Drone"]),
    );
  });

  it("shows the first dozen items with no query", () => {
    expect(searchItems("  ")).toEqual(searchIndex().slice(0, 12));
  });
});
