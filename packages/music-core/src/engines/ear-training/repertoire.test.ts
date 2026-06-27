import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent, type Score, type ScoreNote } from "@repo/music-core/domain";

import { buildRepertoireEarTransfers, createRepertoireTransferExercise } from "./repertoire";

describe("repertoire ear-transfer projection", () => {
  test("extracts short scale-degree phrases from a saved melody score", () => {
    const score = scoreWithNotes([note(60, 0), note(62, 1), note(64, 2), note(67, 3), note(72, 6)]);

    expect(buildRepertoireEarTransfers(score, { phraseLength: 4 })).toEqual([
      {
        id: "score-1:0:4",
        scoreId: "score-1",
        title: "Transfer Study",
        keySignature: "C",
        startBeat: 0,
        endBeat: 4,
        degrees: ["1", "2", "3", "5"],
        unsupportedDegrees: [],
        answerLabel: "1 / do, 2 / re, 3 / mi, 5 / sol",
        midiNotes: [60, 62, 64, 67],
        playback: [
          { midiNotes: [60], offsetSeconds: 0, durationSeconds: 0.5 },
          { midiNotes: [62], offsetSeconds: 0.5, durationSeconds: 0.5 },
          { midiNotes: [64], offsetSeconds: 1, durationSeconds: 0.5 },
          { midiNotes: [67], offsetSeconds: 1.5, durationSeconds: 0.5 },
        ],
      },
    ]);
  });

  test("skips non-melody voices and notes outside the selected degree set", () => {
    const score = scoreWithNotes([
      note(48, 0, "bass"),
      note(60, 0),
      note(61, 1),
      note(62, 2),
      note(66, 3),
      note(67, 4),
    ]);

    expect(
      buildRepertoireEarTransfers(score, {
        phraseLength: 3,
        scaleDegreeSet: "major-diatonic",
      }),
    ).toEqual([
      expect.objectContaining({
        degrees: ["1", "b2", "2"],
        unsupportedDegrees: ["b2"],
      }),
      expect.objectContaining({
        degrees: ["2", "#4", "5"],
        unsupportedDegrees: ["#4"],
      }),
    ]);
  });

  test("creates a scored play-back exercise from a repertoire transfer", () => {
    const [transfer] = buildRepertoireEarTransfers(
      scoreWithNotes([note(60, 0), note(62, 1), note(64, 2), note(67, 3)]),
      { phraseLength: 4 },
    );
    const exercise = createRepertoireTransferExercise(transfer!);
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.5 };
    const prompt = exercise.generate(context);
    const correct = exercise.createRun(prompt, context);
    const partial = exercise.createRun(prompt, context);

    expect(exercise).toMatchObject({
      id: "ear.repertoire-transfer.score-1-0-4",
      name: "Repertoire Transfer",
      skillIds: ["pitch.scale-degree.1"],
      inputs: ["midi", "onscreen"],
    });
    expect(prompt.payload).toMatchObject({
      drill: "repertoire-transfer",
      answerToken: "1-2-3-5",
      answerLabel: "1 / do, 2 / re, 3 / mi, 5 / sol",
      sourceTitle: "Transfer Study",
      targetMidiNotes: [60, 62, 64, 67],
      requiredPlayedNotes: 4,
    });

    for (const midiNote of [60, 62, 64, 67]) correct.accept(noteOn(midiNote));
    for (const midiNote of [60, 62, 62, 67]) partial.accept(noteOn(midiNote));

    expect(correct.finish()).toMatchObject({
      correct: true,
      score: 1,
      answer: ["1", "2", "3", "5"],
    });
    expect(partial.finish()).toMatchObject({
      correct: false,
      score: 0.75,
      answer: ["1", "2", "2", "5"],
    });
  });
});

function scoreWithNotes(notes: ScoreNote[]): Score {
  return {
    id: "score-1",
    title: "Transfer Study",
    origin: "generated",
    keySignature: "C",
    tempoMap: [{ atBeat: 0, bpm: 120 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [
      { id: "melody", name: "Melody", role: "melody" },
      { id: "bass", name: "Bass", role: "bass" },
    ],
    notes,
    chords: [],
    sections: [],
    markers: [],
  };
}

function note(midiNote: number, startBeat: number, voiceId = "melody"): ScoreNote {
  return {
    midiNote,
    startBeat,
    durationBeats: 1,
    velocity: 0.8,
    voiceId,
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
