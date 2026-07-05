import { describe, expect, test } from "vitest";

import { monotonicMs, type ControlChangeEvent, type NoteOnEvent } from "@repo/music-core/domain";

import { createAerophoneIntervalLandingExercise } from "./aerophone-interval-landing";

describe("createAerophoneIntervalLandingExercise", () => {
  test("a flubbed attack corrected before the hold grades the settled note", () => {
    const exercise = createAerophoneIntervalLandingExercise({
      droneMidi: 60,
      interval: "P5",
      holdMs: 2_000,
    });
    const context = {
      targetSkillIds: exercise.skillIds,
      difficulty: 0.5,
      instrument: "aerophone" as const,
    };
    const run = exercise.createRun(exercise.generate(context), context);

    // Common wind flub: brief mis-fingered F#4, immediately corrected to G4.
    run.accept(note(66, 0));
    run.accept(note(67, 120));
    run.accept(breath(0.7, 200));
    run.accept(breath(0.71, 1_200));
    run.accept(breath(0.7, 2_200));

    const result = run.finish({ reason: "completed" });
    expect(result.answer).toMatchObject({ playedMidi: 67, landingErrorSemitones: 0 });
    expect(result.correct).toBe(true);
  });

  test("scores a steady target landing over a drone", () => {
    const exercise = createAerophoneIntervalLandingExercise({
      droneMidi: 60,
      interval: "P5",
      holdMs: 2_000,
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

    expect(prompt.payload).toMatchObject({
      label: "C4 to G4 · Perfect fifth",
      droneMidi: 60,
      targetMidi: 67,
      interval: { id: "P5", label: "Perfect fifth", semitones: 7 },
      holdMs: 2_000,
    });

    run.accept(note(67, 0));
    run.accept(breath(0.7, 0));
    run.accept(breath(0.72, 1_000));
    run.accept(breath(0.71, 2_000));

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
    expect(result.target).toEqual({ label: "C4 to G4 · Perfect fifth", midiNotes: [60, 67] });
    expect(result.answer).toMatchObject({
      droneMidi: 60,
      targetMidi: 67,
      playedMidi: 67,
      intervalId: "P5",
    });
  });

  test("lands descending intervals below the drone", () => {
    const exercise = createAerophoneIntervalLandingExercise({
      droneMidi: 60,
      interval: "P5",
      direction: "down",
      holdMs: 2_000,
    });
    const context = {
      targetSkillIds: exercise.skillIds,
      difficulty: 0.5,
      instrument: "aerophone" as const,
    };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    expect(prompt.payload).toMatchObject({
      label: "C4 down to F3 · Perfect fifth",
      droneMidi: 60,
      targetMidi: 53,
      direction: "down",
    });

    run.accept(note(53, 0));
    run.accept(breath(0.7, 0));
    run.accept(breath(0.72, 1_000));
    run.accept(breath(0.71, 2_000));

    const result = run.finish();
    expect(result.correct).toBe(true);
    expect(result.answer).toMatchObject({ targetMidi: 53, playedMidi: 53 });

    // The ascending G4 would have been correct in "up" mode — not here.
    const wrongRun = exercise.createRun(exercise.generate(context), context);
    wrongRun.accept(note(67, 0));
    wrongRun.accept(breath(0.7, 0));
    wrongRun.accept(breath(0.72, 2_000));
    expect(wrongRun.finish().correct).toBe(false);
  });

  test("penalizes landing on the wrong interval", () => {
    const exercise = createAerophoneIntervalLandingExercise({
      droneMidi: 60,
      interval: "P4",
      holdMs: 2_000,
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
    run.accept(breath(0.72, 2_000));

    const result = run.finish();
    expect(result.correct).toBe(false);
    expect(result.score).toBeLessThan(0.8);
    expect(result.feedback[0]?.message).toContain("Target C4 to F4");
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
