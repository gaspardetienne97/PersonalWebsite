import { describe, expect, test } from "vitest";

import {
  monotonicMs,
  unixMs,
  type NoteEvent,
  type Score,
  type ScoreNote,
  type SkillMastery,
} from "@repo/music-core/domain";

import {
  buildRepertoireEarTransfers,
  buildRepertoireReviewQueue,
  createRepertoireTransferExercise,
} from "./repertoire";

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

describe("repertoire review queue", () => {
  const masteryFor =
    (overrides: Record<string, Partial<SkillMastery>>) =>
    (skillId: string): SkillMastery => ({
      skillId,
      mastery: 0,
      confidence: 0,
      decayRate: 0.02,
      observations: 0,
      ...overrides[skillId],
    });

  test("collects phrases across all songs and orders weakest scale-degree first", () => {
    const songA = { ...scoreWithNotes(scale([60, 62, 64, 67])), id: "a", title: "A song" };
    const songB = { ...scoreWithNotes(scale([60, 64, 65, 67])), id: "b", title: "B song" };

    const queue = buildRepertoireReviewQueue(
      [songA, songB],
      masteryFor({
        "pitch.scale-degree.1": { mastery: 0.9, observations: 8 },
        "pitch.scale-degree.2": { mastery: 0.85, observations: 8 },
        "pitch.scale-degree.3": { mastery: 0.85, observations: 8 },
        "pitch.scale-degree.4": { mastery: 0.2, observations: 5 }, // weak link in song B
        "pitch.scale-degree.5": { mastery: 0.85, observations: 8 },
      }),
      { phraseLength: 4 },
    );

    expect(queue.map((item) => [item.transfer.scoreId, item.status])).toEqual([
      ["b", "due"],
      ["a", "strong"],
    ]);
    expect(queue[0]!.weakestSkillId).toBe("pitch.scale-degree.4");
  });

  test("marks never-practiced phrases as new and ranks them above reviewed ones", () => {
    const queue = buildRepertoireReviewQueue(
      [scoreWithNotes(scale([60, 62, 64, 67]))],
      masteryFor({}),
      {
        phraseLength: 4,
      },
    );

    expect(queue[0]!.status).toBe("new");
    expect(queue[0]!.priority).toBeGreaterThan(1);
  });

  test("decays once-strong skills by recency so stale phrases become due", () => {
    const lastPracticed = 1_000_000_000_000;
    const strong = { mastery: 0.9, observations: 8, lastPracticed: unixMs(lastPracticed) };

    const queue = buildRepertoireReviewQueue(
      [scoreWithNotes(scale([60, 62, 64, 67]))],
      masteryFor({
        "pitch.scale-degree.1": strong,
        "pitch.scale-degree.2": strong,
        "pitch.scale-degree.3": strong,
        "pitch.scale-degree.5": strong,
      }),
      { phraseLength: 4, now: lastPracticed + 60 * 86_400_000 },
    );

    expect(queue[0]!.status).toBe("due");
    expect(queue[0]!.decayedMastery).toBeCloseTo(0.9 * Math.exp(-0.02 * 60), 5);
  });

  test("caps the queue to the limit", () => {
    const steps = [0, 2, 4, 5, 7];
    const notes = Array.from({ length: 24 }, (_, index) =>
      note(60 + steps[index % steps.length]!, index),
    );

    const queue = buildRepertoireReviewQueue([scoreWithNotes(notes)], masteryFor({}), {
      phraseLength: 3,
      limit: 4,
    });

    expect(queue.length).toBe(4);
  });
});

function scale(midiNotes: number[]): ScoreNote[] {
  return midiNotes.map((midiNote, index) => note(midiNote, index));
}

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
