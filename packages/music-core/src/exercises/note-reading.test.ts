import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";

import { noteReadingFlashcardExercise } from "./note-reading";

const noteOn = (midiNote: number): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source: "onscreen",
  timestamp: monotonicMs(0),
  clock: "performance",
});

describe("noteReadingFlashcardExercise", () => {
  test("grades answer-by-play and records pitch metrics", () => {
    const ctx = { targetSkillIds: ["reading.treble.landmarks"], difficulty: 0.3 };
    const prompt = noteReadingFlashcardExercise.generate(ctx);
    const run = noteReadingFlashcardExercise.createRun(prompt, ctx);

    run.accept(noteOn(prompt.payload.midiNote));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
    expect(result.metrics).toContainEqual({
      kind: "pitch",
      expectedMidi: prompt.payload.midiNote,
      actualMidi: prompt.payload.midiNote,
    });
  });

  test("degrades wrong notes", () => {
    const ctx = { targetSkillIds: ["reading.treble.landmarks"], difficulty: 0.3 };
    const prompt = noteReadingFlashcardExercise.generate(ctx);
    const run = noteReadingFlashcardExercise.createRun(prompt, ctx);

    run.accept(noteOn(prompt.payload.midiNote + 2));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
  });
});
