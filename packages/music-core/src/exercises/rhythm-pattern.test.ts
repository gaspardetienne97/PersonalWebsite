import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";

import {
  createRhythmPatternExercise,
  RHYTHM_PATTERN_CATALOG,
  rhythmPatternDefinition,
} from "./rhythm-pattern";

const tap = (atMs: number): NoteEvent => ({
  type: "onset",
  strength: 1,
  source: "onscreen",
  timestamp: monotonicMs(atMs),
  clock: "performance",
});

describe("rhythm pattern catalog", () => {
  test("lists the first generated rhythm pattern family", () => {
    expect(RHYTHM_PATTERN_CATALOG.map((pattern) => pattern.id)).toEqual([
      "quarter-pulse",
      "eighths",
      "sixteenths",
      "eighth-rests",
      "triplets",
      "gap-click-1-on-1-off",
    ]);
    expect(rhythmPatternDefinition("gap-click-1-on-1-off").clickSchedule).toEqual([
      { bar: 0, audible: true },
      { bar: 1, audible: false },
    ]);
  });

  test("builds beat-relative targets, rests, and absolute expected times", () => {
    const exercise = createRhythmPatternExercise({
      patternId: "eighth-rests",
      bpm: 120,
      bars: 1,
      startTimestampMs: 1000,
    });
    const prompt = exercise.generate({ targetSkillIds: exercise.skillIds, difficulty: 0.4 });

    expect(prompt.id).toBe("rhythm-pattern-eighth-rests-120-1");
    expect(prompt.payload).toMatchObject({
      id: "eighth-rests",
      label: "Eighth-note rests",
      bpm: 120,
      meter: { beats: 4, beatUnit: 4 },
      bars: 1,
      rests: [
        { startBeat: 0.5, endBeat: 1 },
        { startBeat: 1.5, endBeat: 2 },
        { startBeat: 2.5, endBeat: 3 },
        { startBeat: 3.5, endBeat: 4 },
      ],
      expectedMs: [1000, 1500, 2000, 2500],
    });
    expect(prompt.payload.events.map((event) => event.beat)).toEqual([0, 1, 2, 3]);
  });

  test("repeats the gap-click schedule cyclically across extra bars", () => {
    const exercise = createRhythmPatternExercise({
      patternId: "gap-click-1-on-1-off",
      bpm: 100,
      bars: 4,
      startTimestampMs: 0,
    });
    const prompt = exercise.generate({ targetSkillIds: exercise.skillIds, difficulty: 0.4 });

    expect(prompt.payload.clickSchedule).toEqual([
      { bar: 0, audible: true },
      { bar: 1, audible: false },
      { bar: 2, audible: true },
      { bar: 3, audible: false },
    ]);
    // 4 bars of quarter notes = 16 targets, silent bars included.
    expect(prompt.payload.events).toHaveLength(16);
  });
});

describe("createRhythmPatternExercise", () => {
  test("scores accurate eighth-note taps highly", () => {
    const exercise = createRhythmPatternExercise({ patternId: "eighths", bpm: 120, bars: 1 });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    expect(exercise.skillIds).toEqual(["rhythm.pattern.eighths", "rhythm.subdivision.eighths"]);
    [0, 250, 500, 750, 1000, 1250, 1500, 1750].forEach((time) => run.accept(tap(time)));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.answer).toMatchObject({
      missedEvents: 0,
      extraRestHits: 0,
      meanAbsoluteErrorMs: 0,
      meanSignedErrorMs: 0,
    });
    expect(result.metrics.filter((metric) => metric.kind === "timing")).toHaveLength(8);
  });

  test("penalizes extra hits inside rest windows", () => {
    const exercise = createRhythmPatternExercise({ patternId: "eighth-rests", bpm: 120, bars: 1 });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    [0, 250, 500, 1000, 1500].forEach((time) => run.accept(tap(time)));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(false);
    expect(result.answer).toMatchObject({
      extraRestHits: 1,
      missedEvents: 0,
    });
    expect(result.feedback[0]?.message).toContain("1 rest hit");
  });

  test("one missed tap doesn't cascade into misgrading every later hit", () => {
    const exercise = createRhythmPatternExercise({ patternId: "quarter-pulse", bpm: 120, bars: 1 });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    // Miss beat 1 (500ms); the other three land dead on.
    [0, 1000, 1500].forEach((time) => run.accept(tap(time)));
    const result = run.finish({ reason: "completed" });

    // The three real hits match their own slots with 0 error — no fabricated
    // 999ms metrics, no shifted pairings.
    const timing = result.metrics.filter((metric) => metric.kind === "timing");
    expect(timing).toHaveLength(3);
    expect(timing.map((metric) => metric.errorMs)).toEqual([0, 0, 0]);
    expect(result.answer).toMatchObject({
      missedEvents: 1,
      extraHits: 0,
      meanAbsoluteErrorMs: 0,
      meanSignedErrorMs: 0,
    });
    // Exactly one miss penalty: 1 - 0.2.
    expect(result.score).toBeCloseTo(0.8, 5);
  });

  test("an empty performance scores zero instead of riding a 0ms 'error'", () => {
    const exercise = createRhythmPatternExercise({ patternId: "quarter-pulse", bpm: 120, bars: 1 });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const run = exercise.createRun(exercise.generate(ctx), ctx);

    const result = run.finish({ reason: "completed" });

    expect(result.score).toBe(0);
    expect(result.answer.missedEvents).toBe(4);
  });

  test("tags sixteenth-note and gap-click patterns with adaptive review skills", () => {
    expect(createRhythmPatternExercise({ patternId: "sixteenths", bpm: 100 }).skillIds).toContain(
      "rhythm.subdivision.sixteenths",
    );
    expect(
      createRhythmPatternExercise({ patternId: "gap-click-1-on-1-off", bpm: 100 }).skillIds,
    ).toContain("rhythm.gap-click");
  });
});
