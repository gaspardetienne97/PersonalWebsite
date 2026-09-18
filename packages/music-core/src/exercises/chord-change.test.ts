import { describe, expect, test } from "vitest";

import {
  Capability,
  monotonicMs,
  resultToScoringEvent,
  unixMs,
  type NoteOnEvent,
  type ScoringEvent,
} from "@repo/music-core/domain";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import { CHORD_SHAPES } from "./chord-perfect";
import { chordChangeHistory, createChordChangeExercise } from "./chord-change";

describe("createChordChangeExercise", () => {
  test("scores clean C major to G major changes as a transition drill", () => {
    const tuning = curatedTunings("guitar")[0]!;
    const fromShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.c-major")!;
    const toShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.g-major")!;
    const exercise = createChordChangeExercise({ tuning, fromShape, toShape, repetitions: 1 });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.45 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    expect(prompt.payload).toMatchObject({
      label: "C major to G major chord changes",
      fromShapeId: "guitar.c-major",
      toShapeId: "guitar.g-major",
      repetitions: 1,
    });
    expect(prompt.payload.targets.map((target) => target.shapeId)).toEqual([
      "guitar.c-major",
      "guitar.g-major",
    ]);
    expect(exercise.skillIds).toEqual(
      expect.arrayContaining(["technique.strings.chord-changes", "technique.guitar.chord-changes"]),
    );

    prompt.payload.targets.forEach((target, targetIndex) => {
      target.midiNotes.forEach((midiNote, noteIndex) => {
        run.accept(note(midiNote, targetIndex * 1_000 + noteIndex * 40));
      });
    });

    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
    expect(result.answer).toMatchObject({
      completedChanges: 2,
      cleanChanges: 2,
      firstChangeLatencyMs: 1_000,
      coverageByChange: [1, 1],
    });
    expect(result.feedback[0]?.message).toContain("2/2 clean chord targets");
  });

  test("an extra string squeak doesn't shift later chords onto the wrong window", () => {
    const tuning = curatedTunings("guitar")[0]!;
    const fromShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.c-major")!;
    const toShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.g-major")!;
    const exercise = createChordChangeExercise({ tuning, fromShape, toShape, repetitions: 1 });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.45 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    // First strum: all C-major strings + a doubled string (squeak/re-attack)
    // inside the same strum window.
    prompt.payload.targets[0]!.midiNotes.forEach((midiNote, index) => {
      run.accept(note(midiNote, index * 40));
    });
    run.accept(note(prompt.payload.targets[0]!.midiNotes[0]!, 260));
    // Second strum after a real change gap: clean G major.
    prompt.payload.targets[1]!.midiNotes.forEach((midiNote, index) => {
      run.accept(note(midiNote, 1_200 + index * 40));
    });

    const result = run.finish({ reason: "completed" });

    // Count-based chunking would have pulled a G-major note into the C window
    // and graded both chords dirty; gap clustering keeps both clean.
    expect(result.answer).toMatchObject({
      completedChanges: 2,
      cleanChanges: 2,
      coverageByChange: [1, 1],
      firstChangeLatencyMs: 1_200,
    });
    expect(result.correct).toBe(true);
  });

  test("one-minute mode counts clean changes across an unbounded alternating cycle", () => {
    const tuning = curatedTunings("guitar")[0]!;
    const fromShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.c-major")!;
    const toShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.g-major")!;
    const exercise = createChordChangeExercise({ tuning, fromShape, toShape, durationSeconds: 60 });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.45 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    expect(prompt.payload.durationSeconds).toBe(60);
    expect(prompt.payload.label).toBe("C major to G major one-minute changes");
    // Timed targets are just the alternating pair template.
    expect(prompt.payload.targets.map((target) => target.shapeId)).toEqual([
      "guitar.c-major",
      "guitar.g-major",
    ]);

    // Four clean strums cycling C, G, C, G — more than the two-target template.
    const cycle = [prompt.payload.targets[0]!, prompt.payload.targets[1]!];
    for (let strum = 0; strum < 4; strum += 1) {
      cycle[strum % 2]!.midiNotes.forEach((midiNote, noteIndex) => {
        run.accept(note(midiNote, strum * 1_000 + noteIndex * 40));
      });
    }

    // Timed runs never self-complete on input progress; the clock ends them.
    expect(run.getLiveState().progress).toBe(0);

    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
    expect(result.answer).toMatchObject({
      completedChanges: 4,
      cleanChanges: 4,
      changesPerMinute: 4,
      firstChangeLatencyMs: 1_000,
    });
    expect(result.metrics).toContainEqual({
      kind: "chord-changes",
      tuningId: tuning.id,
      durationSeconds: 60,
      fromShapeId: "guitar.c-major",
      fromMidiNotes: prompt.payload.targets[0]!.midiNotes,
      toShapeId: "guitar.g-major",
      toMidiNotes: prompt.payload.targets[1]!.midiNotes,
      completedChanges: 4,
      cleanChanges: 4,
      changesPerMinute: 4,
    });
    expect(result.feedback[0]?.message).toContain("4 clean chord targets in 60s");
  });

  test("an empty one-minute run scores zero changes per minute", () => {
    const tuning = curatedTunings("guitar")[0]!;
    const fromShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.c-major")!;
    const toShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.g-major")!;
    const exercise = createChordChangeExercise({ tuning, fromShape, toShape, durationSeconds: 60 });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.45 };
    const run = exercise.createRun(exercise.generate(context), context);

    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
    expect(result.answer).toMatchObject({
      completedChanges: 0,
      cleanChanges: 0,
      changesPerMinute: 0,
    });
    const event = resultToScoringEvent({
      result,
      sessionId: "session",
      runId: "run",
      exercise,
      prompt: exercise.generate(context),
      at: unixMs(100),
      difficulty: 0.45,
      instrument: "guitar",
      assistance: "guided",
      makeId: () => "zero-input",
    });
    expect(event.metrics).toContainEqual(
      expect.objectContaining({
        kind: "chord-changes",
        completedChanges: 0,
        cleanChanges: 0,
        changesPerMinute: 0,
      }),
    );
    expect(event).toMatchObject({ instrument: "guitar", assistance: "guided" });
    expect(event).not.toHaveProperty("source");
  });

  test("does not add benchmark metadata to repetition runs", () => {
    const tuning = curatedTunings("guitar")[0]!;
    const fromShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.c-major")!;
    const toShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.g-major")!;
    const exercise = createChordChangeExercise({ tuning, fromShape, toShape, repetitions: 1 });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.45 };

    const result = exercise.createRun(exercise.generate(context), context).finish();

    expect(result.metrics.some((metric) => metric.kind === "chord-changes")).toBe(false);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid timed duration %s",
    (durationSeconds) => {
      const tuning = curatedTunings("guitar")[0]!;
      const fromShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.c-major")!;
      const toShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.g-major")!;

      expect(() =>
        createChordChangeExercise({ tuning, fromShape, toShape, durationSeconds }),
      ).toThrow("Timed chord changes require a positive finite duration");
    },
  );

  test("penalizes a wrong target shape during the second change", () => {
    const tuning = curatedTunings("guitar")[0]!;
    const fromShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.c-major")!;
    const toShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.g-major")!;
    const exercise = createChordChangeExercise({ tuning, fromShape, toShape, repetitions: 1 });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.45 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);
    const wrongShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.d-major")!;
    const wrongNotes = wrongShape.frets
      .map((fret, index) => (fret === null ? undefined : tuning.openStrings[index]! + fret))
      .filter((midiNote): midiNote is number => midiNote !== undefined)
      .sort((left, right) => left - right);

    prompt.payload.targets[0]!.midiNotes.forEach((midiNote, index) => {
      run.accept(note(midiNote, index * 40));
    });
    wrongNotes.forEach((midiNote, index) => {
      run.accept(note(midiNote, 1_000 + index * 40));
    });

    const result = run.finish({ reason: "completed" });
    const answer = result.answer;

    expect(answer).toBeDefined();

    expect(result.correct).toBe(false);
    expect(result.score).toBeLessThan(1);
    expect(answer?.cleanChanges).toBe(1);
    expect(answer?.coverageByChange[1]).toBeLessThan(1);
  });
});

describe("chordChangeHistory", () => {
  const benchmark = {
    instrument: "guitar" as const,
    tuningId: "guitar-standard",
    durationSeconds: 60,
    fromShapeId: "guitar.c-major",
    fromMidiNotes: [48, 52, 55, 60, 64],
    toShapeId: "guitar.g-major",
    toMidiNotes: [43, 47, 50, 55, 59, 67],
  };

  test("returns newest exact-pair runs once and preserves observed provenance", () => {
    const old = benchmarkEvent("old", 100, 24, { source: "midi", assistance: "independent" });
    const latest = benchmarkEvent("latest", 300, 30, {
      source: "onscreen",
      assistance: "guided",
    });

    expect(chordChangeHistory([latest, old, latest], benchmark)).toEqual([
      expect.objectContaining({
        event: latest,
        metric: expect.objectContaining({ changesPerMinute: 30 }),
      }),
      expect.objectContaining({
        event: old,
        metric: expect.objectContaining({ changesPerMinute: 24 }),
      }),
    ]);
  });

  test("separates ordered positions, tuning, instrument and exact target pitches", () => {
    const matching = benchmarkEvent("matching", 100, 20);
    const variants = [
      benchmarkEvent(
        "reverse",
        200,
        21,
        {},
        { fromShapeId: benchmark.toShapeId, toShapeId: benchmark.fromShapeId },
      ),
      benchmarkEvent("position", 300, 22, {}, { fromShapeId: "guitar.c-major@1" }),
      benchmarkEvent("tuning", 400, 23, {}, { tuningId: "guitar-drop-d" }),
      benchmarkEvent("pitches", 500, 24, {}, { fromMidiNotes: [60, 64, 67] }),
      benchmarkEvent("instrument", 600, 25, { instrument: "ukulele" }),
    ];

    expect(
      chordChangeHistory([matching, ...variants], benchmark).map(({ event }) => event.id),
    ).toEqual(["matching"]);
  });

  test("omits legacy events and bounds the newest results", () => {
    const legacy = benchmarkEvent("legacy", 1_000, 99);
    legacy.metrics = [];
    const events = Array.from({ length: 8 }, (_, index) =>
      benchmarkEvent(`event-${index}`, index, index),
    );

    expect(
      chordChangeHistory([legacy, ...events], benchmark, 3).map(({ event }) => event.id),
    ).toEqual(["event-7", "event-6", "event-5"]);
  });
});

function benchmarkEvent(
  id: string,
  at: number,
  changesPerMinute: number,
  provenance: Partial<ScoringEvent> = {},
  metric: Partial<Extract<ScoringEvent["metrics"][number], { kind: "chord-changes" }>> = {},
): ScoringEvent {
  return {
    id,
    sessionId: id,
    exerciseId: "technique.guitar.chord-changes",
    skillIds: ["technique.guitar.chord-changes"],
    capabilities: [Capability.Technique],
    instrument: "guitar",
    at: unixMs(at),
    correct: changesPerMinute > 0,
    partialCredit: changesPerMinute > 0 ? 1 : 0,
    difficulty: 0.45,
    metrics: [
      {
        kind: "chord-changes",
        tuningId: "guitar-standard",
        durationSeconds: 60,
        fromShapeId: "guitar.c-major",
        fromMidiNotes: [48, 52, 55, 60, 64],
        toShapeId: "guitar.g-major",
        toMidiNotes: [43, 47, 50, 55, 59, 67],
        completedChanges: changesPerMinute,
        cleanChanges: changesPerMinute,
        changesPerMinute,
        ...metric,
      },
    ],
    ...provenance,
  };
}

function note(midiNote: number, atMs: number): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "onscreen",
    instrument: "guitar",
    timestamp: monotonicMs(atMs),
    clock: "performance",
  };
}
