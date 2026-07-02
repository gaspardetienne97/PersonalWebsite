import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";

import {
  createScalePatternExercise,
  JAZZ_SCALE_KINDS,
  majorScaleExercise,
  scaleSemitones,
} from "./scale-pattern";

const note = (midiNote: number, atMs: number): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source: "onscreen",
  timestamp: monotonicMs(atMs),
  clock: "performance",
});

describe("scale kinds", () => {
  test("each scale kind has correct semitone intervals", () => {
    expect(scaleSemitones("major")).toEqual([0, 2, 4, 5, 7, 9, 11, 12]);
    expect(scaleSemitones("dorian")).toEqual([0, 2, 3, 5, 7, 9, 10, 12]);
    expect(scaleSemitones("mixolydian")).toEqual([0, 2, 4, 5, 7, 9, 10, 12]);
    expect(scaleSemitones("altered")).toEqual([0, 1, 3, 4, 6, 8, 10, 12]);
    // The bebop dominant scale is an 8-note scale (adds the major 7).
    expect(scaleSemitones("bebop-dominant")).toHaveLength(9);
    expect(scaleSemitones("harmonic-minor")).toEqual([0, 2, 3, 5, 7, 8, 11, 12]);
    expect(scaleSemitones("major-pentatonic")).toEqual([0, 2, 4, 7, 9, 12]);
    expect(scaleSemitones("minor-pentatonic")).toEqual([0, 3, 5, 7, 10, 12]);
    expect(scaleSemitones("blues")).toEqual([0, 3, 5, 6, 7, 10, 12]);
    expect(scaleSemitones("bebop-major")).toEqual([0, 2, 4, 5, 7, 8, 9, 11, 12]);
    expect(scaleSemitones("whole-tone")).toEqual([0, 2, 4, 6, 8, 10, 12]);
  });

  test("a jazz scale exercise generates its own MIDI notes from C4", () => {
    const exercise = createScalePatternExercise({ tonic: "C4", scale: "dorian" });
    const prompt = exercise.generate({ targetSkillIds: exercise.skillIds, difficulty: 0.4 });
    // C4=60; Dorian = 60,62,63,65,67,69,70,72.
    expect(prompt.payload.midiNotes).toEqual([60, 62, 63, 65, 67, 69, 70, 72]);
  });

  test("JAZZ_SCALE_KINDS only lists jazz/modal scales, not plain major/minor", () => {
    expect(JAZZ_SCALE_KINDS).toContain("dorian");
    expect(JAZZ_SCALE_KINDS).toContain("altered");
    expect(JAZZ_SCALE_KINDS).not.toContain("major");
    expect(JAZZ_SCALE_KINDS).not.toContain("natural-minor");
  });

  test("scale exercises can generate descending motion", () => {
    const exercise = createScalePatternExercise({ tonic: "D4", scale: "major", motion: "down" });
    const prompt = exercise.generate({ targetSkillIds: exercise.skillIds, difficulty: 0.4 });

    expect(prompt.payload.motion).toBe("down");
    expect(prompt.payload.midiNotes).toEqual([74, 73, 71, 69, 67, 66, 64, 62]);
  });

  test("scale exercises can generate up-down motion without duplicating the top note", () => {
    const exercise = createScalePatternExercise({
      tonic: "C4",
      scale: "major",
      motion: "up-down",
    });
    const prompt = exercise.generate({ targetSkillIds: exercise.skillIds, difficulty: 0.4 });

    expect(prompt.payload.motion).toBe("up-down");
    expect(prompt.payload.midiNotes).toEqual([
      60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60,
    ]);
  });

  test("scale exercises can generate pentascale and two-octave spans", () => {
    const pentascale = createScalePatternExercise({
      tonic: "C4",
      scale: "major",
      span: "pentascale",
    }).generate({ targetSkillIds: ["technique.scale.major"], difficulty: 0.2 });
    const twoOctave = createScalePatternExercise({
      tonic: "C4",
      scale: "major",
      span: "two-octave",
    }).generate({ targetSkillIds: ["technique.scale.major"], difficulty: 0.6 });

    expect(pentascale.payload.span).toBe("pentascale");
    expect(pentascale.payload.midiNotes).toEqual([60, 62, 64, 65, 67]);
    expect(twoOctave.payload.span).toBe("two-octave");
    expect(twoOctave.payload.midiNotes).toEqual([
      60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84,
    ]);
  });
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
