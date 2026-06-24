import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";

import {
  createAerophoneArticulationExercise,
  type ArticulationStyle,
} from "./aerophone-articulation";

describe("createAerophoneArticulationExercise", () => {
  test("scores short, detached notes as clean staccato", () => {
    const result = run("staccato", 0.35);
    expect(result.answer).toMatchObject({ pitchAccuracy: 1 });
    expect(result.answer!.articulationScore).toBeGreaterThan(0.9);
    expect(result.correct).toBe(true);
  });

  test("scores connected notes as clean legato", () => {
    const result = run("legato", 0.95);
    expect(result.answer!.articulationScore).toBeGreaterThan(0.9);
    expect(result.correct).toBe(true);
  });

  test("penalizes long notes against a staccato target", () => {
    const result = run("staccato", 0.95);
    expect(result.answer!.pitchAccuracy).toBe(1);
    expect(result.answer!.articulationScore).toBeLessThan(0.3);
    expect(result.correct).toBe(false);
  });

  test("flags note-on-only input as missing sustained articulation", () => {
    const exercise = createAerophoneArticulationExercise({
      targetMidi: 67,
      style: "staccato",
      count: 4,
      bpm: 120,
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);
    const beatMs = prompt.payload.beatMs;
    for (let i = 0; i < 4; i += 1) run.accept(noteOn(67, i * beatMs));
    const result = run.finish({ reason: "completed" });
    expect(result.answer!.articulationScore).toBe(0);
    expect(result.feedback[0]?.message).toContain("wind controller");
  });
});

function run(style: ArticulationStyle, fraction: number) {
  const exercise = createAerophoneArticulationExercise({
    targetMidi: 67,
    style,
    count: 4,
    bpm: 120,
  });
  const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
  const prompt = exercise.generate(context);
  const r = exercise.createRun(prompt, context);
  const beatMs = prompt.payload.beatMs;
  for (let i = 0; i < 4; i += 1) {
    const at = i * beatMs;
    r.accept(noteOn(67, at));
    r.accept(cc(2, 0.7, at + 5));
    r.accept(noteOff(67, at + fraction * beatMs));
  }
  return r.finish({ reason: "completed" });
}

function noteOn(midiNote: number, atMs: number): NoteEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "midi",
    instrument: "aerophone",
    timestamp: monotonicMs(atMs),
    clock: "performance",
  };
}

function noteOff(midiNote: number, atMs: number): NoteEvent {
  return {
    type: "noteOff",
    midiNote,
    source: "midi",
    instrument: "aerophone",
    timestamp: monotonicMs(atMs),
    clock: "performance",
  };
}

function cc(controller: number, value: number, atMs: number): NoteEvent {
  return {
    type: "cc",
    controller,
    value,
    source: "midi",
    instrument: "aerophone",
    timestamp: monotonicMs(atMs),
    clock: "performance",
  };
}
