import { describe, expect, test } from "vitest";

import { curatedTunings } from "@repo/music-core/engines/tunings";

import { projectFretboard, projectPiano, projectPlayableGroup } from "./index";

const guitarStandard = curatedTunings("guitar")[0]!;
const ukuleleHighG = curatedTunings("ukulele")[0]!;

describe("music-core/projection", () => {
  test("projects exact piano keys with a stable hand split", () => {
    expect(projectPiano([48, 60, 72])).toEqual([
      { midiNote: 48, hand: "left" },
      { midiNote: 60, hand: "right" },
      { midiNote: 72, hand: "right" },
    ]);
  });

  test("projects every valid fretboard location in conventional string order", () => {
    expect(projectFretboard([64], guitarStandard)).toEqual(
      expect.arrayContaining([
        { midiNote: 64, string: 1, fret: 0 },
        { midiNote: 64, string: 2, fret: 5 },
      ]),
    );
    expect(projectFretboard([67], ukuleleHighG)).toEqual(
      expect.arrayContaining([{ midiNote: 67, string: 4, fret: 0 }]),
    );
  });

  test("finds a compact grouped-note solution using distinct strings", () => {
    const group = projectPlayableGroup([60, 64, 67], guitarStandard);

    expect(group?.positions).toHaveLength(3);
    expect(new Set(group?.positions.map(({ string }) => string)).size).toBe(3);
    expect(group?.span).toBeLessThanOrEqual(5);
  });

  test("respects the requested fret-span limit", () => {
    expect(projectPlayableGroup([60, 64, 67], guitarStandard, 1)).toBeUndefined();
  });

  test("rejects groups outside the selected instrument range", () => {
    expect(projectPlayableGroup([40, 41, 42], ukuleleHighG)).toBeUndefined();
  });
});
