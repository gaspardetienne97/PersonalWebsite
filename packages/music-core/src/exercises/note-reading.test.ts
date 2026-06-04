import { describe, expect, test } from "vitest";

import { monotonicMs, type ExerciseContext, type NoteEvent } from "@repo/music-core/domain";
import { projectPlayableGroup } from "@repo/music-core/engines/projection";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import {
  createNoteReadingExercise,
  noteReadingChoiceEvent,
  type NoteReadingOptions,
} from "./note-reading";

const context: ExerciseContext = {
  targetSkillIds: ["reading.treble.landmarks"],
  difficulty: 0.3,
};

describe("noteReadingExercise", () => {
  test("generates a deterministic key-aware single-note prompt inside the selected range", () => {
    const exercise = createNoteReadingExercise({
      random: () => 0,
      options: pianoOptions({ keys: ["F# major"] }),
    });

    const prompt = exercise.generate(context);

    expect(prompt.payload.keySignature).toBe("F# major");
    expect(prompt.payload.clef).toBe("treble");
    expect(prompt.payload.writtenPitches[0]).toMatchObject({ accidental: "#" });
    expect(prompt.payload.midiNotes[0]).toBeGreaterThanOrEqual(60);
    expect(prompt.payload.midiNotes[0]).toBeLessThanOrEqual(72);
    expect(prompt.payload.score.notes[0]?.writtenPitch).toEqual(prompt.payload.writtenPitches[0]);
  });

  test("accepts an enharmonic note-name choice while preserving intended spelling", () => {
    const exercise = createNoteReadingExercise({
      random: () => 0,
      options: pianoOptions({ keys: ["F# major"] }),
    });
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    run.accept(noteReadingChoiceEvent("Db", prompt.payload.choices));
    const result = run.finish();

    expect(result.correct).toBe(true);
    expect(result.answer).toBe("Db");
    expect(result.target?.label).toBe("C#4");
    expect(result.metrics).toContainEqual({ kind: "choice", expected: "C#", actual: "Db" });
  });

  test("requires the exact sounding pitch and octave for answer-by-play", () => {
    const exercise = createNoteReadingExercise({
      random: () => 0,
      options: pianoOptions({ keys: ["F# major"] }),
    });
    const prompt = exercise.generate(context);
    const expected = prompt.payload.midiNotes[0]!;

    const correctRun = exercise.createRun(prompt, context);
    correctRun.accept(noteOn(expected));
    expect(correctRun.finish().correct).toBe(true);

    const wrongOctave = exercise.createRun(prompt, context);
    wrongOctave.accept(noteOn(expected - 12));
    expect(wrongOctave.finish()).toMatchObject({ correct: false, score: 0 });
  });

  test("waits for a complete chord before reporting live completion", () => {
    const exercise = createNoteReadingExercise({
      random: () => 0,
      options: pianoOptions({ promptKind: "chord" }),
    });
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    run.accept(noteOn(prompt.payload.midiNotes[0]!));
    expect(run.getLiveState().progress).toBeLessThan(1);

    for (const midiNote of prompt.payload.midiNotes.slice(1)) run.accept(noteOn(midiNote));
    expect(run.getLiveState().progress).toBe(1);
    expect(run.finish()).toMatchObject({ correct: true, score: 1 });
  });

  test("generates playable guitar and ukulele chord prompts for the selected tuning", () => {
    for (const tuning of [curatedTunings("guitar")[0]!, curatedTunings("ukulele")[0]!]) {
      const exercise = createNoteReadingExercise({
        random: () => 0,
        options: {
          instrument: tuning.instrument,
          tuning,
          clefs: ["treble"],
          keys: ["C major"],
          range: {
            lowestMidi: Math.min(...tuning.openStrings),
            highestMidi: Math.max(...tuning.openStrings) + 12,
          },
          promptKind: "chord",
        },
      });

      const prompt = exercise.generate(context);

      expect(projectPlayableGroup(prompt.payload.midiNotes, tuning)).toBeDefined();
    }
  });
});

function pianoOptions(overrides: Partial<NoteReadingOptions> = {}): NoteReadingOptions {
  return {
    instrument: "piano",
    clefs: ["treble"],
    keys: ["C major"],
    range: { lowestMidi: 60, highestMidi: 72 },
    promptKind: "single-note",
    ...overrides,
  };
}

function noteOn(midiNote: number): NoteEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "onscreen",
    timestamp: monotonicMs(0),
    clock: "performance",
  };
}
