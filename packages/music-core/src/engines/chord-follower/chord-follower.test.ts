import { describe, expect, test } from "vitest";

import type { JamProgression } from "@repo/music-core/engines/jam";
import { beatToMs } from "@repo/music-core/engines/score-follower";

import { createChordFollower, expectedChordsFromProgression, type ChordObservation } from "./index";

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

function onset(pitchClasses: number[], atMs: number): ChordObservation {
  return { pitchClasses, confidence: 1, source: "onset", atMs };
}

describe("createChordFollower", () => {
  const expected = expectedChordsFromProgression(II_V_I); // Dm7, G7, Cmaj7
  const bpm = 120;
  const startAtMs = 1_000;
  const downbeat = (index: number) => startAtMs + beatToMs(expected[index]!.startBeat, bpm);

  test("grades a clean, in-time run as all correct", () => {
    const run = createChordFollower(expected, { bpm, startAtMs });
    run.accept(onset(expected[0]!.pitchClasses, downbeat(0)));
    run.accept(onset(expected[1]!.pitchClasses, downbeat(1)));
    run.accept(onset(expected[2]!.pitchClasses, downbeat(2)));
    const summary = run.finish();

    expect(summary.correct).toBe(3);
    expect(summary.total).toBe(3);
    expect(summary.grades.map((grade) => grade.timingBand)).toEqual([
      "in-time",
      "in-time",
      "in-time",
    ]);
    expect(summary.score).toBe(1);
  });

  test("advances when the next chord is detected and marks a wrong chord unmatched", () => {
    const run = createChordFollower(expected, { bpm, startAtMs });
    run.accept(onset(expected[0]!.pitchClasses, downbeat(0))); // Dm7 correct
    run.accept(onset([1, 3, 6, 8], downbeat(1))); // garbage where G7 should be
    run.accept(onset(expected[2]!.pitchClasses, downbeat(2))); // Cmaj7 correct → advances past G7
    const summary = run.finish();

    expect(summary.grades[0]!.matched).toBe(true);
    expect(summary.grades[1]!.matched).toBe(false);
    expect(summary.grades[2]!.matched).toBe(true);
    expect(summary.correct).toBe(2);
  });

  test("flags a late chord", () => {
    const run = createChordFollower(expected, { bpm, startAtMs, strictness: "strict" });
    run.accept(onset(expected[0]!.pitchClasses, downbeat(0) + 2_000)); // way late
    run.accept(onset(expected[1]!.pitchClasses, downbeat(1)));
    run.finish();
    expect(run.state().grades[0]!.timingBand).toBe("late");
  });

  test("does not grade a noise-flooded all-12 observation as a clean match", () => {
    const run = createChordFollower(expected, { bpm, startAtMs });
    run.accept({
      pitchClasses: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      confidence: 1,
      source: "chroma",
      atMs: downbeat(0),
    });
    const summary = run.finish();
    expect(summary.grades[0]!.matched).toBe(false);
  });
});
