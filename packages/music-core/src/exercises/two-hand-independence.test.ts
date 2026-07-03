import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";

import { createTwoHandIndependenceExercise } from "./two-hand-independence";

describe("createTwoHandIndependenceExercise", () => {
  test("builds a steady LH pulse against a faster RH line", () => {
    const exercise = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
    });
    const prompt = exercise.generate({
      targetSkillIds: exercise.skillIds,
      difficulty: 0.4,
    });

    // 1 bar of 4/4: LH one root per beat, RH two notes per beat.
    expect(prompt.payload.leftMidiNotes).toEqual([36, 36, 36, 36]);
    expect(prompt.payload.rightMidiNotes).toHaveLength(8);
    expect(prompt.payload.rightMidiNotes.slice(0, 4)).toEqual([60, 62, 64, 65]);
    expect(prompt.payload.splitMidi).toBe(48);
    expect(prompt.payload.beatMs).toBe(500);
    expect(prompt.payload.patternKind).toBe("lh-pulse-rh-line");
    expect(prompt.payload.targetEvents.slice(0, 3)).toEqual([
      { hand: "left", midiNote: 36, beat: 0 },
      { hand: "right", midiNote: 60, beat: 0 },
      { hand: "right", midiNote: 62, beat: 0.5 },
    ]);
  });

  test("builds role-swap and shell-line patterns with explicit hand lanes", () => {
    const roleSwap = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
      patternKind: "rh-pulse-lh-line",
    });
    expect(roleSwap.skillIds).not.toContain("technique.piano.independence.shell-line");
    const roleSwapPrompt = roleSwap.generate({ targetSkillIds: [], difficulty: 0.4 }).payload;

    expect(roleSwapPrompt.leftMidiNotes.slice(0, 4)).toEqual([36, 38, 40, 41]);
    expect(roleSwapPrompt.rightMidiNotes).toEqual([60, 60, 60, 60]);
    expect(roleSwapPrompt.targetEvents.filter((event) => event.hand === "right")).toHaveLength(4);

    const shellExercise = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
      patternKind: "lh-shell-rh-line",
    });
    const shell = shellExercise.generate({ targetSkillIds: [], difficulty: 0.4 }).payload;

    expect(shellExercise.skillIds).toContain("technique.piano.independence.shell-line");
    expect(shell.leftMidiNotes.slice(0, 4)).toEqual([36, 43, 46, 43]);
    expect(shell.rightMidiNotes.slice(0, 4)).toEqual([60, 62, 64, 67]);
    expect(shell.label).toContain("Shell + line");
  });

  test("can isolate the left-hand lane for focused practice", () => {
    const prompt = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
      patternKind: "alberti-rh-holds",
      handMode: "left",
    }).generate({ targetSkillIds: [], difficulty: 0.4 }).payload;

    expect(prompt.handMode).toBe("left");
    expect(prompt.leftMidiNotes).toEqual([36, 43, 40, 43, 36, 43, 40, 43]);
    expect(prompt.rightMidiNotes).toEqual([]);
    expect(prompt.targetEvents.every((event) => event.hand === "left")).toBe(true);
  });

  test("scores a clean two-hand performance as correct", () => {
    const exercise = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
    });
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
    const exercise = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
    });
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

  test("scores an isolated hand without requiring the muted lane", () => {
    const exercise = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
      patternKind: "alberti-rh-holds",
      handMode: "left",
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    prompt.payload.leftMidiNotes.forEach((midi, index) => run.accept(note(midi, index * 250)));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.answer).toMatchObject({ leftAccuracy: 1, rightAccuracy: 1 });
    expect(result.target?.midiNotes).toEqual(prompt.payload.leftMidiNotes);
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
