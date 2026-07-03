import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import { createFretboardNoteFinderExercise } from "./fretboard-note-finder";

const noteOn = (midiNote: number): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source: "onscreen",
  timestamp: monotonicMs(0),
  clock: "performance",
});

describe("fretboard note finder", () => {
  test("prompts an exact fretted note and scores the first answer", () => {
    const exercise = createFretboardNoteFinderExercise({
      tuning: curatedTunings("guitar")[0]!,
      stringNumber: 6,
      fretNumber: 5,
    });
    const prompt = exercise.generate({
      targetSkillIds: ["technique.guitar.note-finder"],
      difficulty: 0.3,
      instrument: "guitar",
    });
    const correctRun = exercise.createRun(prompt, {
      targetSkillIds: ["technique.guitar.note-finder"],
      difficulty: 0.3,
    });
    const wrongRun = exercise.createRun(prompt, {
      targetSkillIds: ["technique.guitar.note-finder"],
      difficulty: 0.3,
    });

    expect(prompt.payload).toMatchObject({
      label: "Find A2",
      targetMidi: 45,
      targetNote: "A2",
      targetPitchClass: "A",
      instrument: "guitar",
      stringNumber: 6,
      fretNumber: 5,
    });
    expect(prompt.payload.positions).toContainEqual({
      stringNumber: 6,
      fretNumber: 5,
      midiNote: 45,
    });

    correctRun.accept(noteOn(45));
    wrongRun.accept(noteOn(46));

    expect(correctRun.finish().correct).toBe(true);
    expect(wrongRun.finish().metrics).toContainEqual({
      kind: "pitch",
      expectedMidi: 45,
      actualMidi: 46,
    });
  });
});
