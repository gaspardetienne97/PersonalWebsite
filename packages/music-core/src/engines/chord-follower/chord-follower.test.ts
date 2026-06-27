import { describe, expect, test } from "vitest";

import type { JamProgression } from "@repo/music-core/engines/jam";

import { expectedChordsFromProgression } from "./index";

const II_V_I: JamProgression = {
  id: "ii-v-i",
  name: "ii–V–I",
  key: "C",
  style: "jazz",
  chords: [
    { symbol: "Dm7", roman: "ii", scale: "D dorian", bars: 2 },
    { symbol: "G7", roman: "V", scale: "G mixolydian", bars: 2 },
    { symbol: "Cmaj7", roman: "I", scale: "C major", bars: 2 },
  ],
};

describe("expectedChordsFromProgression", () => {
  test("derives timed pitch-class templates from a jam progression", () => {
    const expected = expectedChordsFromProgression(II_V_I);
    expect(expected).toEqual([
      { symbol: "Dm7", pitchClasses: [0, 2, 5, 9], startBeat: 0, durationBeats: 8 },
      { symbol: "G7", pitchClasses: [2, 5, 7, 11], startBeat: 8, durationBeats: 8 },
      { symbol: "Cmaj7", pitchClasses: [0, 4, 7, 11], startBeat: 16, durationBeats: 8 },
    ]);
  });
});
