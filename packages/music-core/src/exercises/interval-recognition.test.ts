import { describe, expect, test } from "vitest";

import { monotonicMs, type ExerciseContext, type NoteEvent } from "@repo/music-core/domain";

import { choiceAnswerEvent } from "./ear-training";
import { createIntervalRecognitionExercise } from "./interval-recognition";

const noteOn = (midiNote: number): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source: "onscreen",
  timestamp: monotonicMs(0),
  clock: "performance",
});

const context = (difficulty: number): ExerciseContext => ({
  targetSkillIds: ["pitch.interval.m6"],
  difficulty,
});

describe("interval recognition", () => {
  test("uses difficulty and random input to choose prompt direction", () => {
    const easy = context(0.2);
    const hard = context(0.9);

    expect(
      createIntervalRecognitionExercise({ random: () => 0 }).generate(easy).payload.direction,
    ).toBe("ascending");
    expect(
      createIntervalRecognitionExercise({ random: () => 0.75 }).generate(hard).payload.direction,
    ).toBe("descending");
    expect(
      createIntervalRecognitionExercise({ random: () => 0.95 }).generate(hard).payload.direction,
    ).toBe("harmonic");
  });

  test("grades choice answers and records substitutions", () => {
    const exercise = createIntervalRecognitionExercise({ random: () => 0 });
    const ctx = context(0.2);
    const prompt = exercise.generate(ctx);
    const tokens = prompt.payload.choices.map(({ token }) => token);
    const correctRun = exercise.createRun(prompt, ctx);
    const wrongRun = exercise.createRun(prompt, ctx);

    correctRun.accept(choiceAnswerEvent("m6", tokens));
    wrongRun.accept(choiceAnswerEvent("P5", tokens));

    expect(correctRun.finish().correct).toBe(true);
    expect(wrongRun.finish().metrics).toContainEqual({
      kind: "choice",
      expected: "m6",
      actual: "P5",
    });
  });

  test.each([
    ["ascending", 0, [60, 68]],
    ["descending", 0.75, [68, 60]],
    ["harmonic", 0.95, [68, 60]],
  ] as const)("grades %s play-back answers", (_direction, random, notes) => {
    const exercise = createIntervalRecognitionExercise({ random: () => random });
    const ctx = context(0.9);
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    notes.forEach((note) => run.accept(noteOn(note)));

    expect(run.finish().correct).toBe(true);
  });
});
