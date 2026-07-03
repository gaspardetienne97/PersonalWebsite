import { describe, expect, test } from "vitest";

import { monotonicMs, type ExerciseContext, type NoteEvent } from "@repo/music-core/domain";
import { notationView } from "@repo/music-core/engines/notation";
import { projectPlayableGroup } from "@repo/music-core/engines/projection";
import { expectedGroups } from "@repo/music-core/engines/score-follower";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import {
  createSightReadingExercise,
  READING_LEVELS,
  type SightReadingOptions,
} from "./sight-reading";

const context: ExerciseContext = {
  targetSkillIds: ["reading.treble.landmarks"],
  difficulty: 0.7,
};

describe("music-core/sight-reading", () => {
  test("generates deterministic grand-staff piano prompts", () => {
    const prompt = createSightReadingExercise({
      random: () => 0,
      options: {
        ...baseOptions(),
        instrument: "piano",
        clefs: ["treble", "bass"],
        difficulty: 0.7,
      },
    }).generate(context);

    expect(prompt.payload.score.voices.map(({ id }) => id)).toEqual(["right-hand", "left-hand"]);
    expect(notationView(prompt.payload.score).staves.map(({ clef }) => clef)).toEqual([
      "treble",
      "bass",
    ]);
    expect(expectedGroups(prompt.payload.score).some(({ midiNotes }) => midiNotes.length > 1)).toBe(
      true,
    );
  });

  test("generates playable guitar and ukulele groups for selected tunings", () => {
    for (const tuning of [curatedTunings("guitar")[0]!, curatedTunings("ukulele")[0]!]) {
      const prompt = createSightReadingExercise({
        random: sequenceRandom([0, 0.2, 0.4, 0.6, 0.8]),
        options: {
          ...baseOptions(),
          instrument: tuning.instrument,
          tuning,
          clefs: ["treble"],
          difficulty: 0.6,
        },
      }).generate(context);

      for (const group of expectedGroups(prompt.payload.score)) {
        expect(projectPlayableGroup(group.midiNotes, tuning)).toBeDefined();
      }
    }
  });

  test("generates rests, ties, tuplets, compound meter, and sixteenth rhythms at high difficulty", () => {
    const prompt = createSightReadingExercise({
      random: sequenceRandom([0.9, 0.1, 0.7, 0.3, 0.5]),
      options: {
        ...baseOptions(),
        instrument: "piano",
        clefs: ["treble", "bass"],
        timeSignature: { numerator: 6, denominator: 8 },
        difficulty: 0.9,
      },
    }).generate(context);
    const score = prompt.payload.score;

    expect(score.timeSignatures[0]).toEqual(
      expect.objectContaining({ numerator: 6, denominator: 8 }),
    );
    expect(score.rests?.length).toBeGreaterThan(0);
    expect(score.notes.some(({ tie }) => tie !== undefined)).toBe(true);
    expect(score.notes.some(({ tuplet }) => tuplet?.actual === 3)).toBe(true);
    expect(score.notes.some(({ durationBeats }) => durationBeats <= 0.25)).toBe(true);
  });

  test("applies named reading-level metadata to generated prompts", () => {
    const prompt = createSightReadingExercise({
      random: () => 0,
      options: {
        ...baseOptions(),
        readingLevel: "level-3",
      },
    }).generate(context);

    expect(READING_LEVELS.map((level) => level.id)).toEqual(
      expect.arrayContaining(["primer", "level-1", "level-2", "level-3"]),
    );
    expect(prompt.payload.readingLevel).toMatchObject({
      id: "level-3",
      label: "Level 3",
      rhythm: "eighths and syncopation",
      recommendedDifficulty: 0.7,
    });
    expect(prompt.payload.score.markers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "reading-level",
          label: "Level 3",
          kind: "practice",
        }),
      ]),
    );
  });

  test("transposes generated sight-reading sounding notes while preserving written key", () => {
    const basePrompt = createSightReadingExercise({
      random: () => 0,
      options: baseOptions(),
    }).generate(context);
    const transposedPrompt = createSightReadingExercise({
      random: () => 0,
      options: {
        ...baseOptions(),
        transposeSemitones: 2,
      },
    }).generate(context);

    expect(transposedPrompt.payload.transposeSemitones).toBe(2);
    expect(transposedPrompt.payload.score.keySignature).toBe("C major");
    expect(transposedPrompt.payload.score.notes.map((note) => note.midiNote)).toEqual(
      basePrompt.payload.score.notes.map((note) => note.midiNote + 2),
    );
    expect(transposedPrompt.payload.score.notes[0]?.writtenPitch).toEqual(
      basePrompt.payload.score.notes[0]?.writtenPitch,
    );
  });

  test("creates score-follower runs for generated sight-reading prompts", () => {
    const exercise = createSightReadingExercise({
      random: () => 0,
      options: {
        ...baseOptions(),
        instrument: "piano",
        clefs: ["treble"],
        mode: "performance",
        difficulty: 0.3,
      },
    });
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    for (const group of prompt.payload.groups) {
      for (const midiNote of group.midiNotes) {
        run.accept(noteOn(midiNote, group.startBeat * 1_000));
      }
    }

    const result = run.finish();
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
    expect(result.target?.midiNotes).toEqual(
      prompt.payload.groups.flatMap(({ midiNotes }) => midiNotes),
    );
  });
});

function baseOptions(): SightReadingOptions {
  return {
    instrument: "piano",
    keySignature: "C major",
    clefs: ["treble"],
    measures: 2,
    bpm: 60,
    timeSignature: { numerator: 4, denominator: 4 },
    mode: "wait",
    strictness: "normal",
    difficulty: 0.5,
    readingLevel: "level-1",
    transposeSemitones: 0,
  };
}

function sequenceRandom(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

function noteOn(midiNote: number, timestamp: number): NoteEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "midi",
    timestamp: monotonicMs(timestamp),
    clock: "performance",
  };
}
