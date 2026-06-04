import { describe, expect, test } from "vitest";

import { monotonicMs, type ExerciseContext, type NoteEvent } from "@repo/music-core/domain";

import { choiceAnswerEvent } from "./ear-training";
import { createScaleDegreeRecognitionExercise } from "./scale-degree-recognition";

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
});
