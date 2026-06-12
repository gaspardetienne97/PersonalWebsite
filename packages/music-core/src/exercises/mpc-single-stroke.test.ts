import { describe, expect, test } from "vitest";

import {
  Capability,
  monotonicMs,
  type ExerciseContext,
  type NoteOnEvent,
} from "@repo/music-core/domain";
import { createMpcSingleStrokeExercise } from "@repo/music-core/exercises/mpc-single-stroke";

const context: ExerciseContext = {
  targetSkillIds: ["technique.mpc.single-strokes"],
  difficulty: 0.5,
  instrument: "mpc",
};

describe("createMpcSingleStrokeExercise", () => {
  test("passes eight steady alternating hits at the default tempo", () => {
    const exercise = createMpcSingleStrokeExercise();
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);
    const targetSequence = [36, 38, 36, 38, 36, 38, 36, 38];

    expect(exercise).toMatchObject({
      id: "technique.mpc.single-strokes",
      capabilities: [Capability.Technique, Capability.Rhythm],
      skillIds: ["technique.mpc.single-strokes"],
      inputs: ["midi", "onscreen"],
      streaming: true,
    });
    expect(prompt.payload).toMatchObject({
      leftPadMidi: 36,
      rightPadMidi: 38,
      hitCount: 8,
      bpm: 80,
      targetSpacingMs: 375,
      targetSequence,
    });

    targetSequence.forEach((midiNote, index) => {
      run.accept(note(midiNote, 1_000 + index * 375, 0.8));
    });

    expect(run.getLiveState()).toMatchObject({
      progress: 1,
      runningScore: expect.any(Number),
    });

    const result = run.finish({ reason: "completed" });
    expect(result.correct).toBe(true);
    expect(result.score).toBeGreaterThan(0.95);
    expect(result.target).toEqual({
      label: prompt.payload.label,
      midiNotes: targetSequence,
    });
    expect(result.response).toEqual({ midiNotes: targetSequence });
    expect(result.answer).toMatchObject({
      playedPads: targetSequence,
      velocities: Array(8).fill(0.8),
      relativeTimestampsMs: targetSequence.map((_, index) => index * 375),
      padAccuracy: 1,
      meanTimingErrorMs: 0,
      velocityConsistency: 1,
    });
    expect(result.metrics.filter((metric) => metric.kind === "timing")).toHaveLength(8);
    expect(result.metrics.filter((metric) => metric.kind === "velocity")).toHaveLength(8);
  });

  test("ignores other notes while a configured wrong pad consumes the current target", () => {
    const exercise = createMpcSingleStrokeExercise();
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    run.accept(note(42, 900, 0.8));
    [38, 36, 38, 36, 38, 36, 38, 36].forEach((midiNote, index) => {
      run.accept(note(midiNote, 1_000 + index * 375, 0.8));
    });

    const result = run.finish({ reason: "completed" });
    expect(result.correct).toBe(false);
    expect(result.metrics[0]).toEqual({
      kind: "pitch",
      expectedMidi: 36,
      actualMidi: 38,
    });
    expect(result.input).toHaveLength(8);
    expect(result.input).not.toContainEqual(expect.objectContaining({ midiNote: 42 }));
  });

  test("fails correct-order hits that are late and uneven", () => {
    const exercise = createMpcSingleStrokeExercise();
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);
    const timestamps = [0, 500, 800, 1_400, 1_600, 2_400, 2_500, 3_300];
    const velocities = [0.2, 1, 0.2, 1, 0.2, 1, 0.2, 1];

    prompt.payload.targetSequence.forEach((midiNote, index) => {
      run.accept(note(midiNote, timestamps[index]!, velocities[index]!));
    });

    const result = run.finish({ reason: "completed" });
    expect(result.correct).toBe(false);
    expect(result.score).toBeLessThan(0.85);
    expect(
      result.feedback
        .map((item) => item.message)
        .join(" ")
        .toLowerCase(),
    ).toMatch(/timing|velocity/);
  });

  test("rejects identical pads and clamps tempo options", () => {
    expect(() => createMpcSingleStrokeExercise({ leftPadMidi: 36, rightPadMidi: 36 })).toThrowError(
      "Choose two different MPC pads",
    );

    expect(createMpcSingleStrokeExercise({ bpm: 10 }).generate(context).payload.bpm).toBe(30);
    expect(createMpcSingleStrokeExercise({ bpm: 300 }).generate(context).payload.bpm).toBe(240);
  });
});

function note(midiNote: number, atMs: number, velocity: number): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity,
    channel: 1,
    instrument: "mpc",
    source: "midi",
    timestamp: monotonicMs(atMs),
    clock: "midi",
  };
}
