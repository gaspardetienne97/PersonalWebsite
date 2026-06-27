import { describe, expect, test } from "vitest";

import { verifyChordTarget } from "./index";

describe("verifyChordTarget", () => {
  test("marks a target chord complete when every chord tone was observed", () => {
    const result = verifyChordTarget({
      expectedMidiNotes: [48, 52, 55, 60, 64],
      observedMidiNotes: [60, 64, 67],
    });

    expect(result).toMatchObject({
      expectedPitchClasses: [0, 4, 7],
      matchedPitchClasses: [0, 4, 7],
      missingPitchClasses: [],
      extraPitchClasses: [],
      coverage: 1,
      score: 1,
      correct: true,
    });
  });

  test("reports missing target tones without treating repeated notes as progress", () => {
    const result = verifyChordTarget({
      expectedMidiNotes: [48, 52, 55, 60, 64],
      observedMidiNotes: [48, 60, 72],
    });

    expect(result.matchedPitchClasses).toEqual([0]);
    expect(result.missingPitchClasses).toEqual([4, 7]);
    expect(result.coverage).toBeCloseTo(1 / 3);
    expect(result.correct).toBe(false);
  });

  test("penalizes notes outside the expected target", () => {
    const result = verifyChordTarget({
      expectedMidiNotes: [48, 52, 55],
      observedMidiNotes: [48, 52, 55, 58],
    });

    expect(result.extraPitchClasses).toEqual([10]);
    expect(result.coverage).toBe(1);
    expect(result.score).toBeLessThan(1);
    expect(result.correct).toBe(false);
  });
});
