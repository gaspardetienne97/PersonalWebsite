import { describe, expect, test } from "vitest";

import { type ExerciseContext } from "@repo/music-core/domain";

import { choiceAnswerEvent } from "./ear-training";
import { createCadenceRecognitionExercise } from "./cadence-recognition";

const context = (targetSkillId: string, difficulty: number): ExerciseContext => ({
  targetSkillIds: [targetSkillId],
  difficulty,
});

describe("cadence recognition", () => {
  test("generates cadence choices and a two-chord playback prompt", () => {
    const exercise = createCadenceRecognitionExercise({ random: () => 0 });
    const prompt = exercise.generate(context("ear.cadences.authentic", 0.4));

    expect(prompt.payload).toMatchObject({
      drill: "cadence",
      targetSkillId: "ear.cadences.authentic",
      answerToken: "authentic",
      answerLabel: "Authentic",
      romanProgression: ["V", "I"],
    });
    expect(prompt.payload.choices.map(({ token }) => token)).toEqual([
      "authentic",
      "plagal",
      "half",
      "deceptive",
    ]);
    expect(prompt.payload.playback).toHaveLength(2);
    expect(prompt.payload.playback[0]?.midiNotes).toEqual([55, 59, 62, 65]);
    // Plain I triad — a maj7 resolution would identify 'authentic' by chord colour alone.
    expect(prompt.payload.playback[1]?.midiNotes).toEqual([48, 52, 55, 60]);
  });

  test("grades choice answers and records cadence confusions", () => {
    const exercise = createCadenceRecognitionExercise({ random: () => 0 });
    const ctx = context("ear.cadences.plagal", 0.4);
    const prompt = exercise.generate(ctx);
    const tokens = prompt.payload.choices.map(({ token }) => token);
    const correctRun = exercise.createRun(prompt, ctx);
    const wrongRun = exercise.createRun(prompt, ctx);

    correctRun.accept(choiceAnswerEvent("plagal", tokens));
    wrongRun.accept(choiceAnswerEvent("authentic", tokens));

    expect(correctRun.finish().correct).toBe(true);
    expect(wrongRun.finish().metrics).toContainEqual({
      kind: "choice",
      expected: "plagal",
      actual: "authentic",
    });
  });
});
