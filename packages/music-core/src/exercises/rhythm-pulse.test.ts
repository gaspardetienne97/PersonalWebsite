import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";

import { createRhythmPulseExercise } from "./rhythm-pulse";

const tap = (atMs: number): NoteEvent => ({
  type: "onset",
  strength: 1,
  source: "onscreen",
  timestamp: monotonicMs(atMs),
  clock: "performance",
});

describe("createRhythmPulseExercise", () => {
  test("scores in-time quarter-note taps highly", () => {
    const exercise = createRhythmPulseExercise({ bpm: 120, beats: 4 });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    [0, 500, 1000, 1500].forEach((time) => run.accept(tap(time)));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.metrics.filter((metric) => metric.kind === "timing")).toHaveLength(4);
  });

  test("reports consistent rushing as timing feedback", () => {
    const exercise = createRhythmPulseExercise({ bpm: 120, beats: 4 });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    [-70, 430, 930, 1430].forEach((time) => run.accept(tap(time)));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(false);
    expect(result.feedback[0]?.message).toContain("ahead");
  });
});
