import { describe, expect, test } from "vitest";

import { monotonicMs, type ExerciseContext, type NoteEvent } from "@repo/music-core/domain";

import { choiceAnswerEvent } from "./ear-training";
import { createChordQualityRecognitionExercise } from "./chord-quality-recognition";

const noteOn = (midiNote: number): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source: "onscreen",
  timestamp: monotonicMs(0),
  clock: "performance",
});

const context = (targetSkillId: string, difficulty: number): ExerciseContext => ({
  targetSkillIds: [targetSkillId],
  difficulty,
});

describe("chord quality recognition", () => {
  test("adds seventh qualities at higher difficulty", () => {
    const exercise = createChordQualityRecognitionExercise({ random: () => 0 });
    const low = exercise.generate(context("harmony.triad.major", 0.2));
    const high = exercise.generate(context("harmony.seventh.dominant", 0.9));

    expect(low.payload.choices.map(({ token }) => token)).toEqual([
      "major",
      "minor",
      "diminished",
      "augmented",
    ]);
    expect(high.payload.choices.map(({ token }) => token)).toContain("dominant-7");
  });

  test("grades choice answers and records substitutions", () => {
    const exercise = createChordQualityRecognitionExercise({ random: () => 0 });
    const ctx = context("harmony.triad.minor", 0.2);
    const prompt = exercise.generate(ctx);
    const tokens = prompt.payload.choices.map(({ token }) => token);
    const correctRun = exercise.createRun(prompt, ctx);
    const wrongRun = exercise.createRun(prompt, ctx);

    correctRun.accept(choiceAnswerEvent("minor", tokens));
    wrongRun.accept(choiceAnswerEvent("major", tokens));

    expect(correctRun.finish().correct).toBe(true);
    expect(wrongRun.finish().metrics).toContainEqual({
      kind: "choice",
      expected: "minor",
      actual: "major",
    });
  });

  test("accepts transposed and inverted play-back answers", () => {
    const exercise = createChordQualityRecognitionExercise({ random: () => 0 });
    const ctx = context("harmony.triad.minor", 0.2);
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    [67, 72, 75].forEach((note) => run.accept(noteOn(note)));
    const result = run.finish();

    expect(result.correct).toBe(true);
    expect(result.metrics).toContainEqual({
      kind: "chord",
      expectedPitchClasses: [0, 3, 7],
      actualPitchClasses: [0, 3, 7],
    });
  });
});
