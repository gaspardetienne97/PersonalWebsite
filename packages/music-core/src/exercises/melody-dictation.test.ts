import { describe, expect, test } from "vitest";

import { monotonicMs, type ExerciseContext, type NoteEvent } from "@repo/music-core/domain";

import { createMelodyDictationExercise } from "./melody-dictation";

const context = (degree: string, difficulty = 0.3): ExerciseContext => ({
  targetSkillIds: [`pitch.scale-degree.${degree}`],
  difficulty,
  metadata: { scaleDegreeSet: "anchor" },
});

const chromaticContext = (degree: string): ExerciseContext => ({
  targetSkillIds: [`pitch.scale-degree.${degree}`],
  difficulty: 0.8,
  metadata: { scaleDegreeSet: "chromatic-color" },
});

const noteOn = (midiNote: number): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source: "onscreen",
  timestamp: monotonicMs(0),
  clock: "performance",
});

describe("melody dictation", () => {
  test("generates a short tonic-relative phrase from the selected degree set", () => {
    const exercise = createMelodyDictationExercise({ random: () => 0 });
    const prompt = exercise.generate(context("1"));

    expect(prompt.payload).toMatchObject({
      drill: "melody-dictation",
      targetSkillId: "pitch.scale-degree.1",
      answerToken: "1-5-1",
      answerLabel: "1 / do, 5 / sol, 1 / do",
      degreeSetId: "anchor",
      degrees: ["1", "5", "1"],
      tonicMidi: 48,
      targetMidiNotes: [48, 55, 48],
      requiredPlayedNotes: 3,
    });
    expect(prompt.payload.playback).toEqual([
      { midiNotes: [48], offsetSeconds: 0, durationSeconds: 0.45 },
      { midiNotes: [48], offsetSeconds: 0.6, durationSeconds: 0.45 },
      { midiNotes: [55], offsetSeconds: 1.15, durationSeconds: 0.45 },
      { midiNotes: [48], offsetSeconds: 1.7, durationSeconds: 0.45 },
    ]);
  });

  test("grades the played phrase in order with partial credit", () => {
    const exercise = createMelodyDictationExercise({ random: () => 0 });
    const ctx = context("1");
    const prompt = exercise.generate(ctx);
    const correct = exercise.createRun(prompt, ctx);
    const partial = exercise.createRun(prompt, ctx);

    for (const midiNote of [48, 55, 48]) correct.accept(noteOn(midiNote));
    for (const midiNote of [48, 48, 48]) partial.accept(noteOn(midiNote));

    expect(correct.finish()).toMatchObject({
      correct: true,
      score: 1,
      answer: ["1", "5", "1"],
    });
    expect(partial.finish()).toMatchObject({
      correct: false,
      score: 2 / 3,
      answer: ["1", "1", "1"],
    });
  });

  test("reports out-of-phrase pitches as musical degrees rather than semitone numbers", () => {
    const exercise = createMelodyDictationExercise({ random: () => 0 });
    const ctx = context("1");
    const run = exercise.createRun(exercise.generate(ctx), ctx);
    for (const midi of [51, 54, 58]) run.accept(noteOn(midi));
    expect(run.finish().answer).toEqual(["b3", "#4", "b7"]);
  });

  test("can build short phrases from chromatic scale-degree colors", () => {
    const exercise = createMelodyDictationExercise({ random: () => 0 });
    const prompt = exercise.generate(chromaticContext("b2"));

    expect(prompt.payload).toMatchObject({
      answerToken: "b2-2-b2-1",
      answerLabel: "b2 / ra, 2 / re, b2 / ra, 1 / do",
      degreeSetId: "chromatic-color",
      degrees: ["b2", "2", "b2", "1"],
      targetMidiNotes: [49, 50, 49, 48],
      requiredPlayedNotes: 4,
    });
  });
});
