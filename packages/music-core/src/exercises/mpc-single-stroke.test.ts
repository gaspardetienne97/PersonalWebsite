import { describe, expect, test } from "vitest";

import {
  Capability,
  monotonicMs,
  type ExerciseContext,
  type NoteOnEvent,
} from "@repo/music-core/domain";
import {
  buildMpcRudimentSequence,
  createMpcSingleStrokeExercise,
  MPC_RUDIMENT_PATTERNS,
  assessedMpcResult,
  type MpcHitCount,
} from "@repo/music-core/exercises/mpc-single-stroke";

const context: ExerciseContext = {
  targetSkillIds: ["technique.mpc", "technique.mpc.single-strokes"],
  difficulty: 0.5,
  instrument: "mpc",
};

describe("createMpcSingleStrokeExercise", () => {
  test("excludes fixed on-screen velocity from the displayed assessment only", () => {
    const exercise = createMpcSingleStrokeExercise();
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);
    prompt.payload.targetSequence.forEach((midiNote, i) =>
      run.accept({
        type: "noteOn",
        midiNote,
        velocity: 1,
        source: "onscreen",
        timestamp: monotonicMs(i * 600),
        clock: "performance",
      }),
    );
    const result = run.finish({ reason: "completed" });
    const originalScore = result.score;
    const display = assessedMpcResult(result);
    expect(display.velocityMeasured).toBe(false);
    expect(display.score).toBeCloseTo(
      (result.score - result.answer!.velocityConsistency * 0.15) / 0.85,
    );
    expect(result.score).toBe(originalScore);
    expect(
      assessedMpcResult({
        ...result,
        input: result.input.map((event) => ({ ...event, source: "midi" })),
      }).velocityMeasured,
    ).toBe(true);
  });
  test("exports reusable rudiment pattern data for singles, doubles, and paradiddles", () => {
    expect(buildMpcRudimentSequence("single-strokes", 36, 38, 8)).toEqual([
      36, 38, 36, 38, 36, 38, 36, 38,
    ]);
    expect(buildMpcRudimentSequence("double-strokes", 36, 38, 8)).toEqual([
      36, 36, 38, 38, 36, 36, 38, 38,
    ]);
    expect(buildMpcRudimentSequence("paradiddle", 36, 38, 8)).toEqual([
      36, 38, 36, 36, 38, 36, 38, 38,
    ]);
    expect(buildMpcRudimentSequence("moving-accent", 36, 38, 8)).toEqual([
      36, 38, 36, 38, 36, 38, 36, 38,
    ]);
  });

  test("passes eight steady alternating hits at the default tempo", () => {
    const exercise = createMpcSingleStrokeExercise({ startTimestampMs: 1_000 });
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);
    const targetSequence = [36, 38, 36, 38, 36, 38, 36, 38];

    expect(exercise).toMatchObject({
      id: "technique.mpc.single-strokes",
      capabilities: [Capability.Technique, Capability.Rhythm],
      skillIds: ["technique.mpc", "technique.mpc.single-strokes"],
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

  test("grades double-stroke and paradiddle target sequences", () => {
    const doubleStroke = createMpcSingleStrokeExercise({ patternId: "double-strokes" });
    const doublePrompt = doubleStroke.generate(context);
    expect(doubleStroke.skillIds).not.toContain("technique.mpc.paradiddles");
    expect(doublePrompt.payload).toMatchObject({
      patternId: "double-strokes",
      patternLabel: "Double strokes",
      targetSequence: [36, 36, 38, 38, 36, 36, 38, 38],
    });

    const paradiddle = createMpcSingleStrokeExercise({ patternId: "paradiddle" });
    const paradiddlePrompt = paradiddle.generate(context);
    expect(paradiddle.skillIds).toEqual([
      "technique.mpc",
      "technique.mpc.single-strokes",
      "technique.mpc.paradiddles",
    ]);
    expect(paradiddlePrompt.payload).toMatchObject({
      patternId: "paradiddle",
      patternLabel: "Paradiddle",
      targetSequence: [36, 38, 36, 36, 38, 36, 38, 38],
    });
  });

  test("builds moving-accent target events with velocity bands", () => {
    const exercise = createMpcSingleStrokeExercise({ patternId: "moving-accent", hitCount: 16 });
    const prompt = exercise.generate(context);

    expect(prompt.payload).toMatchObject({
      patternId: "moving-accent",
      patternLabel: "Moving accent",
      targetSequence: [36, 38, 36, 38, 36, 38, 36, 38, 36, 38, 36, 38, 36, 38, 36, 38],
    });
    expect(prompt.payload.targetEvents.map((event) => event.accent)).toEqual([
      "accent",
      "normal",
      "normal",
      "normal",
      "normal",
      "accent",
      "normal",
      "normal",
      "normal",
      "normal",
      "accent",
      "normal",
      "normal",
      "normal",
      "normal",
      "accent",
    ]);
    expect(prompt.payload.targetEvents[0]).toMatchObject({
      index: 0,
      beat: 0,
      hand: "left",
      padMidi: 36,
      velocityBand: { min: 0.75, max: 1, label: "accent" },
    });
    expect(prompt.payload.targetEvents[1]).toMatchObject({
      index: 1,
      beat: 0.5,
      hand: "right",
      padMidi: 38,
      velocityBand: { min: 0.25, max: 0.7, label: "tap" },
    });
  });

  test("scores moving accents against target velocity bands", () => {
    const exercise = createMpcSingleStrokeExercise({ patternId: "moving-accent", hitCount: 8 });
    const prompt = exercise.generate(context);
    const clean = exercise.createRun(prompt, context);

    prompt.payload.targetEvents.forEach((event, index) => {
      clean.accept(
        note(
          event.padMidi,
          index * prompt.payload.targetSpacingMs,
          event.accent === "accent" ? 0.9 : 0.45,
        ),
      );
    });
    const cleanResult = clean.finish({ reason: "completed" });
    expect(cleanResult.correct).toBe(true);
    expect(cleanResult.answer?.velocityConsistency).toBe(1);

    const flat = exercise.createRun(prompt, context);
    prompt.payload.targetEvents.forEach((event, index) => {
      flat.accept(note(event.padMidi, index * prompt.payload.targetSpacingMs, 0.45));
    });
    const flatResult = flat.finish({ reason: "completed" });
    expect(flatResult.correct).toBe(false);
    expect(flatResult.answer?.velocityConsistency).toBeLessThan(1);
    expect(flatResult.feedback[0]?.message.toLowerCase()).toContain("velocity control");
  });

  test("ignores other notes while a configured wrong pad consumes the current target", () => {
    const exercise = createMpcSingleStrokeExercise({ startTimestampMs: 1_000 });
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

  test("gives an empty run no timing credit", () => {
    const exercise = createMpcSingleStrokeExercise();
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    expect(run.getLiveState().runningScore).toBe(0);

    const result = run.finish({ reason: "abandoned" });
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
    expect(result.answer?.meanTimingErrorMs).toBeGreaterThan(0);
  });

  test("fails correct-order hits with late timing at constant velocity", () => {
    const exercise = createMpcSingleStrokeExercise();
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    prompt.payload.targetSequence.forEach((midiNote, index) => {
      run.accept(note(midiNote, index * 500, 0.8));
    });

    const result = run.finish({ reason: "completed" });
    expect(result.correct).toBe(false);
    expect(result.answer?.meanTimingErrorMs).toBeGreaterThan(90);
    expect(result.answer?.velocityConsistency).toBe(1);
    expect(result.feedback[0]?.message.toLowerCase()).toContain("timing");
  });

  test("fails on-grid hits with uneven velocity", () => {
    const exercise = createMpcSingleStrokeExercise();
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    prompt.payload.targetSequence.forEach((midiNote, index) => {
      run.accept(note(midiNote, index * 375, index % 2 === 0 ? 0.1 : 1));
    });

    const result = run.finish({ reason: "completed" });
    expect(result.correct).toBe(false);
    expect(result.answer?.meanTimingErrorMs).toBe(0);
    expect(result.answer?.velocityConsistency).toBeLessThan(0.65);
    expect(result.feedback[0]?.message.toLowerCase()).toContain("velocity consistency");
  });

  test("rejects non-finite BPM and clamps finite tempo options", () => {
    expect(() => createMpcSingleStrokeExercise({ bpm: Number.NaN })).toThrowError(
      "BPM must be a finite number",
    );
    expect(() => createMpcSingleStrokeExercise({ bpm: Number.POSITIVE_INFINITY })).toThrowError(
      "BPM must be a finite number",
    );

    expect(createMpcSingleStrokeExercise({ bpm: 10 }).generate(context).payload.bpm).toBe(30);
    expect(createMpcSingleStrokeExercise({ bpm: 300 }).generate(context).payload.bpm).toBe(240);
  });

  test("rejects invalid MPC pad numbers", () => {
    expect(() => createMpcSingleStrokeExercise({ leftPadMidi: Number.NaN })).toThrowError(
      "leftPadMidi must be an integer between 0 and 127",
    );
    expect(() => createMpcSingleStrokeExercise({ leftPadMidi: 36.5 })).toThrowError(
      "leftPadMidi must be an integer between 0 and 127",
    );
    expect(() => createMpcSingleStrokeExercise({ rightPadMidi: -1 })).toThrowError(
      "rightPadMidi must be an integer between 0 and 127",
    );
    expect(() => createMpcSingleStrokeExercise({ rightPadMidi: 128 })).toThrowError(
      "rightPadMidi must be an integer between 0 and 127",
    );
  });

  test("rejects malformed runtime hit counts", () => {
    const malformedHitCount = 12 as MpcHitCount;

    expect(() => createMpcSingleStrokeExercise({ hitCount: malformedHitCount })).toThrowError(
      "hitCount must be 8 or 16",
    );
  });

  test("measures timing against the click grid, not the first hit", () => {
    const exercise = createMpcSingleStrokeExercise({ bpm: 60, startTimestampMs: 5_000 });
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    expect(prompt.payload).toMatchObject({ subdivision: 2, targetSpacingMs: 500 });
    // A run that is 40 ms late all the way through: even spacing, but behind the click.
    prompt.payload.targetSequence.forEach((midiNote, index) => {
      run.accept(note(midiNote, 5_040 + index * 500, 0.8));
    });

    const result = run.finish({ reason: "completed" });
    expect(prompt.payload.timingAnchor).toBe("click");
    expect(result.answer?.timingAnchor).toBe("click");
    expect(result.answer?.meanTimingErrorMs).toBe(40);
    expect(result.answer?.relativeTimestampsMs[0]).toBe(40);
    expect(result.metrics.find((metric) => metric.kind === "timing")).toMatchObject({
      expectedMs: 0,
      actualMs: 40,
      errorMs: 40,
    });
  });

  test("falls back to the first hit when no click anchor is given", () => {
    const exercise = createMpcSingleStrokeExercise({ bpm: 60 });
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    expect(prompt.payload.timingAnchor).toBe("first-hit");
    expect(prompt.payload.startTimestampMs).toBeUndefined();
    // Evenly spaced, but starting deep into the transport clock: without a click to
    // measure against, even spacing must still read as good timing.
    prompt.payload.targetSequence.forEach((midiNote, index) => {
      run.accept(note(midiNote, 1_200_000 + index * 500, 0.8));
    });

    const result = run.finish({ reason: "completed" });
    expect(result.answer).toMatchObject({ timingAnchor: "first-hit", meanTimingErrorMs: 0 });
    expect(result.correct).toBe(true);
  });

  test("spaces sixteenths at a quarter of the beat", () => {
    const prompt = createMpcSingleStrokeExercise({
      bpm: 60,
      subdivision: 4,
      hitCount: 16,
    }).generate(context).payload;

    expect(prompt.targetSpacingMs).toBe(250);
    expect(prompt.targetEvents.slice(0, 5).map((event) => event.beat)).toEqual([
      0, 0.25, 0.5, 0.75, 1,
    ]);
  });

  test("carries sixteenth singles, triple strokes and flams as pattern data", () => {
    expect(MPC_RUDIMENT_PATTERNS.map((pattern) => pattern.id)).toEqual([
      "single-strokes",
      "double-strokes",
      "paradiddle",
      "moving-accent",
      "single-16ths",
      "triple-strokes",
      "flam",
    ]);

    const sixteenths = createMpcSingleStrokeExercise({
      patternId: "single-16ths",
      bpm: 60,
    }).generate(context).payload;
    expect(sixteenths).toMatchObject({ subdivision: 4, targetSpacingMs: 250 });
    expect(buildMpcRudimentSequence("single-16ths", 36, 38, 8)).toEqual([
      36, 38, 36, 38, 36, 38, 36, 38,
    ]);

    const triples = createMpcSingleStrokeExercise({
      patternId: "triple-strokes",
      bpm: 60,
    }).generate(context).payload;
    expect(triples.subdivision).toBe(3);
    expect(triples.targetSpacingMs).toBeCloseTo(1000 / 3);
    expect(buildMpcRudimentSequence("triple-strokes", 36, 38, 8)).toEqual([
      36, 36, 36, 38, 38, 38, 36, 36,
    ]);

    // A flam is the grace note plus its main hit: two events, one beat.
    const flam = createMpcSingleStrokeExercise({ patternId: "flam", bpm: 60 }).generate(
      context,
    ).payload;
    expect(flam.targetEvents.slice(0, 4)).toMatchObject([
      { beat: 0, padMidi: 38, graceMs: 30 },
      { beat: 0, padMidi: 36 },
      { beat: 0.5, padMidi: 36, graceMs: 30 },
      { beat: 0.5, padMidi: 38 },
    ]);
    expect(flam.targetEvents[1]?.graceMs).toBeUndefined();
  });

  test("expects a flam grace note just ahead of its main hit", () => {
    const exercise = createMpcSingleStrokeExercise({
      patternId: "flam",
      bpm: 60,
      startTimestampMs: 1_000,
    });
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    // Grace 30 ms before each beat, main hit on it.
    prompt.payload.targetEvents.forEach((event) => {
      run.accept(note(event.padMidi, 1_000 + event.beat * 1_000 - (event.graceMs ?? 0), 0.8));
    });

    expect(run.finish({ reason: "completed" }).answer?.meanTimingErrorMs).toBe(0);
  });

  test("keeps the identical-pad validation error stable", () => {
    expect(() => createMpcSingleStrokeExercise({ leftPadMidi: 36, rightPadMidi: 36 })).toThrowError(
      "Choose two different MPC pads",
    );
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
