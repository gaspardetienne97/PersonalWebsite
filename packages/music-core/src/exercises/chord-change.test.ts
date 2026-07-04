import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import { CHORD_SHAPES } from "./chord-perfect";
import { createChordChangeExercise } from "./chord-change";

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
  });

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
