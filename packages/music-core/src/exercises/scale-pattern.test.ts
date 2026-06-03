import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";

import { majorScaleExercise } from "./scale-pattern";

const note = (midiNote: number, atMs: number): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source: "onscreen",
  timestamp: monotonicMs(atMs),
  clock: "performance",
});

describe("majorScaleExercise", () => {
  test("scores a correct even C major scale highly", () => {
    const ctx = { targetSkillIds: majorScaleExercise.skillIds, difficulty: 0.4 };
    const prompt = majorScaleExercise.generate(ctx);
    const run = majorScaleExercise.createRun(prompt, ctx);

    prompt.payload.midiNotes.forEach((midi, index) => run.accept(note(midi, index * 500)));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.feedback[0]?.message).toContain("Evenness");
  });

  test("penalizes wrong scale tones", () => {
    const ctx = { targetSkillIds: majorScaleExercise.skillIds, difficulty: 0.4 };
    const prompt = majorScaleExercise.generate(ctx);
    const run = majorScaleExercise.createRun(prompt, ctx);

    prompt.payload.midiNotes.forEach((midi, index) => {
      run.accept(note(index === 3 ? midi + 1 : midi, index * 500));
    });
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(false);
    expect(result.score).toBeLessThan(0.9);
  });
});
