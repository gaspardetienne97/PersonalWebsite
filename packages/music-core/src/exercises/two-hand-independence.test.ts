import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";

import { createTwoHandIndependenceExercise } from "./two-hand-independence";

describe("createTwoHandIndependenceExercise", () => {
  test("builds a steady LH pulse against a faster RH line", () => {
    const exercise = createTwoHandIndependenceExercise({ tonic: "C4", bpm: 120, bars: 1 });
    const prompt = exercise.generate({ targetSkillIds: exercise.skillIds, difficulty: 0.4 });

    // 1 bar of 4/4: LH one root per beat, RH two notes per beat.
    expect(prompt.payload.leftMidiNotes).toEqual([36, 36, 36, 36]);
    expect(prompt.payload.rightMidiNotes).toHaveLength(8);
    expect(prompt.payload.rightMidiNotes.slice(0, 4)).toEqual([60, 62, 64, 65]);
    expect(prompt.payload.splitMidi).toBe(48);
    expect(prompt.payload.beatMs).toBe(500);
  });

  test("scores a clean two-hand performance as correct", () => {
    const exercise = createTwoHandIndependenceExercise({ tonic: "C4", bpm: 120, bars: 1 });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    const { leftMidiNotes, rightMidiNotes, beatMs } = prompt.payload;
    leftMidiNotes.forEach((midi, index) => run.accept(note(midi, index * beatMs)));
    rightMidiNotes.forEach((midi, index) => run.accept(note(midi, index * (beatMs / 2))));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.answer).toMatchObject({ leftAccuracy: 1, rightAccuracy: 1 });
  });

  test("a hand playing the wrong notes drags only its own accuracy down", () => {
    const exercise = createTwoHandIndependenceExercise({ tonic: "C4", bpm: 120, bars: 1 });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    const { leftMidiNotes, rightMidiNotes, beatMs } = prompt.payload;
    // Left hand clean; right hand plays every note a semitone sharp (still in RH register).
    leftMidiNotes.forEach((midi, index) => run.accept(note(midi, index * beatMs)));
    rightMidiNotes.forEach((midi, index) => run.accept(note(midi + 1, index * (beatMs / 2))));
    const result = run.finish({ reason: "completed" });

    expect(result.answer).toMatchObject({ leftAccuracy: 1, rightAccuracy: 0 });
    expect(result.correct).toBe(false);
    expect(result.feedback[0]?.message).toContain("LH 4/4");
  });
});

function note(midiNote: number, atMs: number): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "onscreen",
    instrument: "piano",
    timestamp: monotonicMs(atMs),
    clock: "performance",
  };
}
