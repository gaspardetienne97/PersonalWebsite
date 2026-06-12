import { describe, expect, test } from "vitest";

import { monotonicMs, type ControlChangeEvent, type NoteOnEvent } from "@repo/music-core/domain";

import { createAerophoneSwellExercise } from "./aerophone-swell";

describe("createAerophoneSwellExercise", () => {
  test("scores a smooth low-high-low CC2 envelope", () => {
    const exercise = createAerophoneSwellExercise({
      targetMidi: 67,
      durationMs: 4_000,
    });
    const prompt = exercise.generate({
      targetSkillIds: exercise.skillIds,
      difficulty: 0.5,
      instrument: "aerophone",
    });
    const run = exercise.createRun(prompt, {
      targetSkillIds: exercise.skillIds,
      difficulty: 0.5,
      instrument: "aerophone",
    });

    run.accept(note(67, 0));
    run.accept(breath(0.2, 0));
    run.accept(breath(0.55, 1_000));
    run.accept(breath(0.9, 2_000));
    run.accept(breath(0.55, 3_000));
    run.accept(breath(0.2, 4_000));

    expect(run.getLiveState()).toMatchObject({
      progress: 1,
      runningScore: expect.any(Number),
    });

    const result = run.finish();
    expect(result.correct).toBe(true);
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.metrics).toContainEqual({
      kind: "breath",
      steadiness: expect.any(Number),
      targetCurve: [0.2, 0.55, expect.closeTo(0.9), 0.55, 0.2],
      actualCurve: [0.2, 0.55, 0.9, 0.55, 0.2],
    });
    expect(result.feedback.map((item) => item.message).join(" ")).toContain("Swell shape");
  });

  test("rejects a flat or incomplete envelope", () => {
    const exercise = createAerophoneSwellExercise({
      targetMidi: 67,
      durationMs: 4_000,
    });
    const prompt = exercise.generate({
      targetSkillIds: exercise.skillIds,
      difficulty: 0.5,
      instrument: "aerophone",
    });
    const run = exercise.createRun(prompt, {
      targetSkillIds: exercise.skillIds,
      difficulty: 0.5,
      instrument: "aerophone",
    });

    run.accept(note(65, 0));
    run.accept(breath(0.5, 0));
    run.accept(breath(0.5, 1_000));
    run.accept(breath(0.5, 2_000));

    const result = run.finish();
    expect(result.correct).toBe(false);
    expect(result.score).toBeLessThan(0.8);
  });
});

function breath(value: number, atMs: number): ControlChangeEvent {
  return {
    type: "cc",
    controller: 2,
    value,
    channel: 1,
    instrument: "aerophone",
    source: "midi",
    timestamp: monotonicMs(atMs),
    clock: "midi",
  };
}

function note(midiNote: number, atMs: number): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    channel: 1,
    instrument: "aerophone",
    source: "midi",
    timestamp: monotonicMs(atMs),
    clock: "midi",
  };
}
