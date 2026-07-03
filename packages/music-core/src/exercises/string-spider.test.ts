import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import { createStringSpiderExercise } from "./string-spider";

describe("createStringSpiderExercise", () => {
  test("builds a guitar 1-2-3-4 pattern from the selected string and fret", () => {
    const exercise = createStringSpiderExercise({
      tuning: curatedTunings("guitar")[0]!,
      stringNumber: 6,
      startFret: 5,
      bpm: 120,
    });
    const prompt = exercise.generate({
      targetSkillIds: exercise.skillIds,
      difficulty: 0.4,
    });

    expect(prompt.payload).toMatchObject({
      instrument: "guitar",
      tuningId: "guitar.standard",
      stringNumber: 6,
      startFret: 5,
      bpm: 120,
      midiNotes: [45, 46, 47, 48],
      targetSpacingMs: 500,
    });
  });

  test("builds named spider pattern variations from the selected string and fret", () => {
    const tuning = curatedTunings("guitar")[0]!;
    const cases = [
      {
        pattern: "descending-4321",
        midiNotes: [48, 47, 46, 45],
        fretNumbers: [8, 7, 6, 5],
        label: "4-3-2-1",
      },
      {
        pattern: "inside-out-1324",
        midiNotes: [45, 47, 46, 48],
        fretNumbers: [5, 7, 6, 8],
        label: "1-3-2-4",
      },
      {
        pattern: "outside-in-1423",
        midiNotes: [45, 48, 46, 47],
        fretNumbers: [5, 8, 6, 7],
        label: "1-4-2-3",
      },
    ] as const;

    for (const expected of cases) {
      const exercise = createStringSpiderExercise({
        tuning,
        stringNumber: 6,
        startFret: 5,
        bpm: 120,
        pattern: expected.pattern,
      } as Parameters<typeof createStringSpiderExercise>[0] & { pattern: typeof expected.pattern });
      const prompt = exercise.generate({
        targetSkillIds: exercise.skillIds,
        difficulty: 0.4,
      });
      const payload = prompt.payload as typeof prompt.payload & {
        pattern?: string;
        fretNumbers?: number[];
        patternLabel?: string;
      };

      expect(payload.pattern).toBe(expected.pattern);
      expect(payload.patternLabel).toContain(expected.label);
      expect(payload.midiNotes).toEqual(expected.midiNotes);
      expect(payload.fretNumbers).toEqual(expected.fretNumbers);
      expect(prompt.id).toContain(expected.pattern);
      expect(exercise.skillIds).toContain("technique.strings.spider.permutations");
    }
  });

  test("repeats the selected pattern across adjacent strings", () => {
    const exercise = createStringSpiderExercise({
      tuning: curatedTunings("guitar")[0]!,
      stringNumber: 6,
      startFret: 5,
      bpm: 120,
      stringSpan: "adjacent-2",
    });
    const prompt = exercise.generate({
      targetSkillIds: exercise.skillIds,
      difficulty: 0.4,
    });

    expect(prompt.payload.stringNumbers).toEqual([6, 5]);
    expect(prompt.payload.fretNumbers).toEqual([5, 6, 7, 8, 5, 6, 7, 8]);
    expect(prompt.payload.midiNotes).toEqual([45, 46, 47, 48, 50, 51, 52, 53]);
    expect(prompt.payload.positions).toEqual([
      { stringNumber: 6, fretNumber: 5, midiNote: 45 },
      { stringNumber: 6, fretNumber: 6, midiNote: 46 },
      { stringNumber: 6, fretNumber: 7, midiNote: 47 },
      { stringNumber: 6, fretNumber: 8, midiNote: 48 },
      { stringNumber: 5, fretNumber: 5, midiNote: 50 },
      { stringNumber: 5, fretNumber: 6, midiNote: 51 },
      { stringNumber: 5, fretNumber: 7, midiNote: 52 },
      { stringNumber: 5, fretNumber: 8, midiNote: 53 },
    ]);
    expect(prompt.payload.label).toContain("strings 6-5");
  });

  test("scores a clean ukulele pattern with pitch and timing feedback", () => {
    const exercise = createStringSpiderExercise({
      tuning: curatedTunings("ukulele")[0]!,
      stringNumber: 1,
      startFret: 1,
      bpm: 120,
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    prompt.payload.midiNotes.forEach((midiNote, index) => {
      run.accept(note(midiNote, index * prompt.payload.targetSpacingMs, "ukulele"));
    });
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.answer).toMatchObject({
      playedMidiNotes: prompt.payload.midiNotes,
      pitchAccuracy: 1,
      meanTimingErrorMs: 0,
    });
    expect(result.metrics.filter((metric) => metric.kind === "pitch")).toHaveLength(4);
    expect(result.metrics.filter((metric) => metric.kind === "timing")).toHaveLength(4);
  });

  test("scores a clean multi-string spider pattern", () => {
    const exercise = createStringSpiderExercise({
      tuning: curatedTunings("guitar")[0]!,
      stringNumber: 6,
      startFret: 5,
      bpm: 120,
      stringSpan: "adjacent-2",
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    prompt.payload.midiNotes.forEach((midiNote, index) => {
      run.accept(note(midiNote, index * prompt.payload.targetSpacingMs, "guitar"));
    });
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.answer).toMatchObject({
      playedMidiNotes: prompt.payload.midiNotes,
      pitchAccuracy: 1,
      meanTimingErrorMs: 0,
    });
    expect(result.metrics.filter((metric) => metric.kind === "pitch")).toHaveLength(8);
    expect(result.feedback[0]?.message).toContain("8/8");
  });

  test("rejects notes played in the wrong order", () => {
    const exercise = createStringSpiderExercise({
      tuning: curatedTunings("guitar")[0]!,
      stringNumber: 6,
      startFret: 0,
      bpm: 120,
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    [40, 42, 41, 43].forEach((midiNote, index) => {
      run.accept(note(midiNote, index * 500, "guitar"));
    });
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(false);
    expect(result.answer).toMatchObject({ pitchAccuracy: 0.5 });
    expect(result.feedback[0]?.message).toContain("2/4");
  });
});

function note(midiNote: number, atMs: number, instrument: "guitar" | "ukulele"): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "onscreen",
    instrument,
    timestamp: monotonicMs(atMs),
    clock: "performance",
  };
}
