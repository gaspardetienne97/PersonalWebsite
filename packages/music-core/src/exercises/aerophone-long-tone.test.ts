import { describe, expect, test } from "vitest";

import { monotonicMs, type ControlChangeEvent, type NoteOnEvent } from "@repo/music-core/domain";

import { createAerophoneLongToneExercise } from "./aerophone-long-tone";

describe("createAerophoneLongToneExercise", () => {
  test("scores a steady CC2 breath stream after the target hold time", () => {
    const exercise = createAerophoneLongToneExercise({
      targetMidi: 67,
      holdMs: 3_000,
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
    run.accept(breath(0.7, 0));
    run.accept(breath(0.72, 1_000));
    run.accept(controller(11, 1, 1_500));
    run.accept(breath(0.69, 2_000));
    run.accept(breath(0.71, 3_000));

    expect(run.getLiveState()).toMatchObject({
      progress: 1,
      runningScore: expect.any(Number),
    });

    const result = run.finish();
    expect(result.correct).toBe(true);
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.metrics).toContainEqual({
      kind: "pitch",
      expectedMidi: 67,
      actualMidi: 67,
    });
    expect(result.metrics).toContainEqual({
      kind: "breath",
      steadiness: expect.any(Number),
      actualCurve: [0.7, 0.72, 0.69, 0.71],
    });
    expect(result.feedback[0]?.message).toContain("Breath steadiness");
  });

  test("does not complete from the wrong controller or an unsteady short stream", () => {
    const exercise = createAerophoneLongToneExercise({
      targetMidi: 67,
      holdMs: 3_000,
    });
    const prompt = exercise.generate({
      targetSkillIds: exercise.skillIds,
      difficulty: 0.5,
    });
    const run = exercise.createRun(prompt, {
      targetSkillIds: exercise.skillIds,
      difficulty: 0.5,
    });

    run.accept(note(65, 0));
    run.accept(controller(11, 1, 0));
    run.accept(breath(0.2, 0));
    run.accept(breath(0.9, 1_000));

    expect(run.getLiveState().progress).toBeCloseTo(1 / 3);

    const result = run.finish();
    expect(result.correct).toBe(false);
    expect(result.metrics).toContainEqual({
      kind: "pitch",
      expectedMidi: 67,
      actualMidi: 65,
    });
    expect(result.score).toBeLessThan(0.8);
  });
});

function breath(value: number, atMs: number): ControlChangeEvent {
  return controller(2, value, atMs);
}

function controller(controllerNumber: number, value: number, atMs: number): ControlChangeEvent {
  return {
    type: "cc",
    controller: controllerNumber,
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
