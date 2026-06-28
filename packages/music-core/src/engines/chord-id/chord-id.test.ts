import { describe, expect, test } from "vitest";

import { identifyChord, toPitchClasses } from "./index";

describe("chord identification", () => {
  test("identifies a major triad regardless of note order or octave", () => {
    expect(identifyChord([60, 64, 67])[0]).toEqual({
      rootPitchClass: 0,
      rootName: "C",
      quality: "maj",
      symbol: "C",
      confidence: 1,
    });
    // Inversion (E in the bass) has the same pitch classes → still C major.
    expect(identifyChord([64, 67, 72])[0]!.symbol).toBe("C");
  });

  test("prefers the more complete seventh chord over its triad", () => {
    const candidates = identifyChord([0, 4, 7, 11]);
    expect(candidates[0]).toMatchObject({ symbol: "Cmaj7", confidence: 1 });
    // The bare C triad is still offered, but ranks below the exact maj7 match.
    const cMajor = candidates.find((candidate) => candidate.symbol === "C");
    expect(cMajor!.confidence).toBeLessThan(1);
  });

  test("identifies minor and dominant chords", () => {
    expect(identifyChord([9, 0, 4])[0]!.symbol).toBe("Am");
    expect(identifyChord([2, 6, 9, 0])[0]!.symbol).toBe("D7");
  });

  test("surfaces the symmetric diminished-seventh ambiguity as ranked candidates", () => {
    const candidates = identifyChord([0, 3, 6, 9]);
    expect(candidates[0]).toMatchObject({ symbol: "Cdim7", confidence: 1 });
    // dim7 is symmetric, so several equally-valid roots come back.
    expect(candidates.filter((candidate) => candidate.confidence === 1).length).toBeGreaterThan(1);
  });

  test("returns nothing for an empty pitch set", () => {
    expect(identifyChord([])).toEqual([]);
  });

  test("toPitchClasses dedupes octaves and sorts", () => {
    expect(toPitchClasses([60, 72, 64, 67, 48])).toEqual([0, 4, 7]);
  });

  test("identifies common extensions (sus4 sevenths, add9, ninths)", () => {
    expect(identifyChord([0, 5, 7, 10])[0]!.symbol).toBe("C7sus4");
    expect(identifyChord([0, 2, 4, 7])[0]!.symbol).toBe("Cadd9");
    expect(identifyChord([0, 2, 4, 7, 10])[0]!.symbol).toBe("C9");
    expect(identifyChord([0, 2, 4, 7, 11])[0]!.symbol).toBe("Cmaj9");
    expect(identifyChord([0, 2, 3, 7, 10])[0]!.symbol).toBe("Cm9");
  });

  test("still prefers a plain triad over the richer add9 for a 3-note set", () => {
    // add9 [0,2,4,7] must not outrank the exact C major triad for [0,4,7].
    expect(identifyChord([0, 4, 7])[0]!.symbol).toBe("C");
  });
});
