import { describe, expect, test } from "vitest";

import { monotonicMs, type ExerciseResult, type NoteEvent } from "@repo/music-core/domain";

import {
  choiceAnswerEvent,
  decodeChoiceAnswer,
  earTrainingRun,
  pitchClasses,
  playedMidiNotes,
  type EarTrainingPromptBase,
} from "./ear-training";

const noteOn = (midiNote: number, source: "midi" | "onscreen" = "onscreen"): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source,
  timestamp: monotonicMs(0),
  clock: "performance",
});

const prompt: EarTrainingPromptBase = {
  drill: "interval",
  targetSkillId: "pitch.interval.m6",
  answerToken: "m6",
  answerLabel: "Minor 6th",
  choices: [
    { token: "P5", label: "Perfect 5th" },
    { token: "m6", label: "Minor 6th" },
  ],
  playback: [],
  requiredPlayedNotes: 2,
};

describe("ear-training exercise primitives", () => {
  test("encodes and decodes stable click choices", () => {
    const event = choiceAnswerEvent("m6", ["P5", "m6"]);

    expect(event.raw?.midiData1).toBe(1);
    expect(decodeChoiceAnswer([event], ["P5", "m6"])).toBe("m6");
  });

  test("extracts note-on input and normalizes pitch classes", () => {
    const input = [noteOn(60), noteOn(64, "midi"), noteOn(67), noteOn(72)];

    expect(playedMidiNotes(input)).toEqual([60, 64, 67, 72]);
    expect(pitchClasses(playedMidiNotes(input))).toEqual([0, 4, 7]);
  });

  test("reports live progress when an answer is complete", () => {
    const grade = (input: NoteEvent[]): ExerciseResult => ({
      correct: true,
      score: 1,
      metrics: [],
      feedback: [],
      input,
    });
    const run = earTrainingRun(prompt, grade);

    run.accept(noteOn(60));
    expect(run.getLiveState().progress).toBe(0.5);
    run.accept(noteOn(68));
    expect(run.getLiveState().progress).toBe(1);
  });
});
