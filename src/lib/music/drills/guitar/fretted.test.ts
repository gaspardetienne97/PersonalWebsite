import { describe, expect, it } from "vitest";
import { customTuningId, exerciseFor, parseTuningNotes, skillsFor } from "./fretted";

describe("fretted helpers", () => {
  it("keeps each instrument's own skills and never claims a missing ukulele twin", () => {
    const spider = [
      "technique.strings.spider",
      "technique.guitar.spider",
      "technique.ukulele.spider",
    ];
    expect(skillsFor(spider, "guitar")).toEqual([
      "technique.strings.spider",
      "technique.guitar.spider",
    ]);
    expect(skillsFor(spider, "ukulele")).toEqual([
      "technique.strings.spider",
      "technique.ukulele.spider",
    ]);
    expect(skillsFor(["technique.strings.spider", "technique.guitar.spider"], "ukulele")).toEqual([
      "technique.strings.spider",
      "technique.ukulele.spider",
    ]);
    // there is no ukulele interval skill in the seed
    expect(
      skillsFor(["technique.guitar.intervals", "technique.guitar.intervals.7"], "ukulele"),
    ).toEqual([]);
  });

  it("swaps exercise ids for the ukulele", () => {
    expect(exerciseFor("technique.guitar.spider", "ukulele")).toBe("technique.ukulele.spider");
    expect(exerciseFor("technique.guitar.spider", "guitar")).toBe("technique.guitar.spider");
  });

  it("parses a tuning low to high into string-1-first MIDI", () => {
    expect(parseTuningNotes("E2 A2 D3 G3 B3 E4")).toEqual([64, 59, 50 + 5, 50, 45, 40]);
    expect(parseTuningNotes("40, 45 50 55 59 64")).toEqual([64, 59, 55, 50, 45, 40]);
    expect(parseTuningNotes("E A D")).toMatch(/octave/);
    expect(parseTuningNotes("")).toMatch(/low to high/);
    expect(customTuningId("Open D (Joni)")).toBe("custom.open-d-joni");
  });
});
