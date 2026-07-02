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
  buildRepertoireReviewPlan,
  buildRepertoireReviewPlanSchedule,
  buildRepertoireReviewQueue,
  createRepertoireTransferExercise,
  type RepertoireReviewItem,
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
      skillIds: [
        "pitch.scale-degree.1",
        "pitch.scale-degree.2",
        "pitch.scale-degree.3",
        "pitch.scale-degree.5",
      ],
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

  test("uses phrase difficulty as a priority boost when mastery is tied", () => {
    const easy = { ...scoreWithNotes(scale([60, 62, 64, 65])), id: "easy", title: "Easy" };
    const hard = { ...scoreWithNotes(scale([60, 66, 61, 67])), id: "hard", title: "Hard" };
    const practiced = { mastery: 0.5, observations: 4 };

    const queue = buildRepertoireReviewQueue(
      [easy, hard],
      masteryFor({
        "pitch.scale-degree.1": practiced,
        "pitch.scale-degree.2": practiced,
        "pitch.scale-degree.3": practiced,
        "pitch.scale-degree.4": practiced,
        "pitch.scale-degree.5": practiced,
        "pitch.scale-degree.b2": practiced,
        "pitch.scale-degree.#4": practiced,
      }),
      { phraseLength: 4 },
    );

    expect(queue.map((item) => item.transfer.scoreId)).toEqual(["hard", "easy"]);
    expect(queue[0]!.phraseDifficulty).toBeGreaterThan(queue[1]!.phraseDifficulty);
    expect(queue[0]!.priority).toBeGreaterThan(queue[1]!.priority);
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

describe("repertoire review plan", () => {
  test("splits a ranked phrase queue into warmup, review, new, and stretch blocks", () => {
    const items = [
      reviewItem("new-hard", "new", 1.5, 0.7),
      reviewItem("due-hard", "due", 1.3, 0.8),
      reviewItem("due-easy", "due", 1.1, 0.2),
      reviewItem("strong-easy", "strong", 0.2, 0.1),
      reviewItem("new-easy", "new", 1.2, 0.15),
      reviewItem("due-stretch", "due", 1, 0.95),
    ];

    const plan = buildRepertoireReviewPlan(items, {
      warmupCount: 1,
      reviewCount: 2,
      newCount: 1,
      stretchCount: 1,
    });

    expect(plan.sections.map((section) => [section.id, section.items.map(itemId)])).toEqual([
      ["warmup", ["strong-easy"]],
      ["review", ["due-hard", "due-easy"]],
      ["new", ["new-hard"]],
      ["stretch", ["due-stretch"]],
    ]);
    expect(plan.recommendedOrder.map(itemId)).toEqual([
      "strong-easy",
      "due-hard",
      "due-easy",
      "new-hard",
      "due-stretch",
    ]);
    expect(plan.totalItems).toBe(5);
  });

  test("converts a review plan into scheduled repertoire-transfer exercises", () => {
    const plan = buildRepertoireReviewPlan(
      [reviewItem("due", "due", 1.2, 0.5), reviewItem("new", "new", 1.4, 0.8)],
      { warmupCount: 0, reviewCount: 1, newCount: 1, stretchCount: 0 },
    );

    expect(buildRepertoireReviewPlanSchedule(plan)).toEqual([
      {
        exerciseId: "ear.repertoire-transfer.due",
        targetSkillIds: [
          "pitch.scale-degree.1",
          "pitch.scale-degree.2",
          "pitch.scale-degree.3",
          "pitch.scale-degree.5",
        ],
        difficulty: 0.6,
        reason: "review",
      },
      {
        exerciseId: "ear.repertoire-transfer.new",
        targetSkillIds: [
          "pitch.scale-degree.1",
          "pitch.scale-degree.2",
          "pitch.scale-degree.3",
          "pitch.scale-degree.5",
        ],
        difficulty: 0.72,
        reason: "new",
      },
    ]);
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

function reviewItem(
  id: string,
  status: RepertoireReviewItem["status"],
  priority: number,
  phraseDifficulty: number,
): RepertoireReviewItem {
  const transfer = buildRepertoireEarTransfers(scoreWithNotes(scale([60, 62, 64, 67])), {
    phraseLength: 4,
  })[0]!;
  return {
    transfer: {
      ...transfer,
      id,
      scoreId: id,
      title: id,
    },
    status,
    priority,
    phraseDifficulty,
    weakestSkillId: "pitch.scale-degree.1",
    decayedMastery: 1 - priority,
  };
}

function itemId(item: RepertoireReviewItem): string {
  return item.transfer.id;
}
