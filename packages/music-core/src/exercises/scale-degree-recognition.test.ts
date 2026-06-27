import { describe, expect, test } from "vitest";

import { monotonicMs, type ExerciseContext, type NoteEvent } from "@repo/music-core/domain";

import { choiceAnswerEvent } from "./ear-training";
import {
  createScaleDegreeRecognitionExercise,
  SCALE_DEGREE_SETS,
} from "./scale-degree-recognition";

const noteOn = (midiNote: number): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source: "onscreen",
  timestamp: monotonicMs(0),
  clock: "performance",
});

const context = (degree: string, difficulty: number): ExerciseContext => ({
  targetSkillIds: [`pitch.scale-degree.${degree}`],
  difficulty,
});

describe("scale degree recognition", () => {
  test("uses increasingly advanced major and minor contexts", () => {
    const exercise = createScaleDegreeRecognitionExercise({ random: () => 0 });

    expect(exercise.generate(context("3", 0.2)).payload.scaleContext).toBe("major");
    expect(exercise.generate(context("b6", 0.5)).payload.scaleContext).toBe("natural-minor");
    expect(exercise.generate(context("7", 0.7)).payload.scaleContext).toBe("harmonic-minor");
    expect(exercise.generate(context("6", 0.9)).payload.scaleContext).toBe("melodic-minor");
  });

  test("labels degrees with movable-do solfege", () => {
    const exercise = createScaleDegreeRecognitionExercise({ random: () => 0 });
    const prompt = exercise.generate(context("b6", 0.5));

    expect(prompt.payload.choices).toContainEqual({ token: "b6", label: "b6 / le" });
    expect(prompt.payload.answerLabel).toBe("b6 / le");
  });

  test("limits prompts and answer choices to the selected degree set", () => {
    const exercise = createScaleDegreeRecognitionExercise({ random: () => 0 });
    const prompt = exercise.generate({
      ...context("5", 0.2),
      metadata: { scaleDegreeSet: "anchor" },
    });

    expect(SCALE_DEGREE_SETS.map(({ id }) => id)).toEqual([
      "anchor",
      "major-pentachord",
      "major-diatonic",
      "minor-diatonic",
      "chromatic-color",
      "full-current",
    ]);
    expect(prompt.payload.degreeSetId).toBe("anchor");
    expect(prompt.payload.choices.map(({ token }) => token)).toEqual(["1", "5"]);
  });

  test("supports chromatic color degrees in prompts and play-back grading", () => {
    const exercise = createScaleDegreeRecognitionExercise({ random: () => 0 });
    const flatTwoPrompt = exercise.generate({
      ...context("b2", 0.85),
      metadata: { scaleDegreeSet: "chromatic-color" },
    });
    const sharpFourPrompt = exercise.generate({
      ...context("#4", 0.85),
      metadata: { scaleDegreeSet: "chromatic-color" },
    });
    const flatTwoRun = exercise.createRun(flatTwoPrompt, context("b2", 0.85));
    const sharpFourRun = exercise.createRun(sharpFourPrompt, context("#4", 0.85));

    expect(flatTwoPrompt.payload).toMatchObject({
      answerToken: "b2",
      answerLabel: "b2 / ra",
      semitones: 1,
      degreeSetId: "chromatic-color",
    });
    expect(sharpFourPrompt.payload).toMatchObject({
      answerToken: "#4",
      answerLabel: "#4 / fi",
      semitones: 6,
      degreeSetId: "chromatic-color",
    });
    expect(flatTwoPrompt.payload.choices.map(({ token }) => token)).toEqual([
      "1",
      "b2",
      "2",
      "b3",
      "3",
      "4",
      "#4",
      "5",
      "b6",
      "6",
      "b7",
      "7",
    ]);

    flatTwoRun.accept(noteOn(flatTwoPrompt.payload.tonicMidi + 1));
    sharpFourRun.accept(noteOn(sharpFourPrompt.payload.tonicMidi + 6));

    expect(flatTwoRun.finish().correct).toBe(true);
    expect(sharpFourRun.finish().correct).toBe(true);
  });

  test("grades choice and play-back answers relative to the tonic", () => {
    const exercise = createScaleDegreeRecognitionExercise({ random: () => 0 });
    const ctx = context("7", 0.7);
    const prompt = exercise.generate(ctx);
    const tokens = prompt.payload.choices.map(({ token }) => token);
    const correctChoice = exercise.createRun(prompt, ctx);
    const wrongChoice = exercise.createRun(prompt, ctx);
    const played = exercise.createRun(prompt, ctx);

    correctChoice.accept(choiceAnswerEvent("7", tokens));
    wrongChoice.accept(choiceAnswerEvent("b7", tokens));
    played.accept(noteOn(prompt.payload.tonicMidi + 11));

    expect(correctChoice.finish().correct).toBe(true);
    expect(wrongChoice.finish().metrics).toContainEqual({
      kind: "choice",
      expected: "7",
      actual: "b7",
    });
    expect(played.finish().correct).toBe(true);
  });

  test("accepts microphone audio pitch as a scale-degree answer", () => {
    const exercise = createScaleDegreeRecognitionExercise({ random: () => 0 });
    const ctx = context("5", 0.2);
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    expect(exercise.inputs).toContain("audio");
    run.accept({ ...noteOn(prompt.payload.tonicMidi + 7), source: "audio", confidence: 0.92 });

    expect(run.finish().correct).toBe(true);
  });
});
