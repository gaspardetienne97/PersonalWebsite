import {
  applyDecay,
  Capability,
  unixMs,
  type ExerciseDefinition,
  type ExerciseResult,
  type NoteEvent,
  type Score,
  type ScoringMetric,
  type SkillMastery,
} from "@repo/music-core/domain";
import type { ScheduledExercise } from "@repo/music-core/engines/exercise";
import {
  earTrainingRun,
  playedMidiNotes,
  type EarTrainingPromptBase,
  type PromptPlaybackStep,
} from "@repo/music-core/exercises/ear-training";
import {
  degreeTokensForScaleDegreeSet,
  identifyScaleDegreeFromMidi,
  type ScaleDegreeSetId,
} from "@repo/music-core/exercises/scale-degree-recognition";

export interface RepertoireEarTransferOptions {
  phraseLength?: number;
  scaleDegreeSet?: ScaleDegreeSetId;
  maxPrompts?: number;
}

export interface RepertoireEarTransfer {
  id: string;
  scoreId: string;
  title: string;
  keySignature?: string;
  startBeat: number;
  endBeat: number;
  degrees: string[];
  unsupportedDegrees: string[];
  answerLabel: string;
  midiNotes: number[];
  playback: PromptPlaybackStep[];
}

export interface RepertoireTransferPrompt extends EarTrainingPromptBase {
  drill: "repertoire-transfer";
  sourceScoreId: string;
  sourceTitle: string;
  sourceStartBeat: number;
  sourceEndBeat: number;
  degrees: string[];
  targetMidiNotes: number[];
}

export function buildRepertoireEarTransfers(
  score: Score,
  options: RepertoireEarTransferOptions = {},
): RepertoireEarTransfer[] {
  const phraseLength = Math.max(2, Math.floor(options.phraseLength ?? 4));
  const maxPrompts = Math.max(1, Math.floor(options.maxPrompts ?? 4));
  const tonicMidi = tonicMidiForKey(score.keySignature);
  if (tonicMidi === undefined) return [];

  const melodyVoiceIds = new Set(
    score.voices.filter(({ role }) => role === "melody").map(({ id }) => id),
  );
  const notes = [...score.notes]
    .filter((note) => melodyVoiceIds.size === 0 || melodyVoiceIds.has(note.voiceId))
    .sort((left, right) => left.startBeat - right.startBeat || left.midiNote - right.midiNote);
  const allowedDegrees = new Set(degreeTokensForScaleDegreeSet(options.scaleDegreeSet));
  const result: RepertoireEarTransfer[] = [];

  const step = Math.max(1, phraseLength - 1);
  for (
    let index = 0;
    index <= notes.length - phraseLength && result.length < maxPrompts;
    index += step
  ) {
    const phrase = notes.slice(index, index + phraseLength);
    const degrees = phrase.map((note) =>
      identifyScaleDegreeFromMidi({
        tonicMidi,
        midiNote: note.midiNote,
        scaleDegreeSet: "full-current",
      }),
    );
    if (degrees.some((degree) => degree === undefined)) continue;

    const tokens = degrees.map((degree) => degree!.token);
    const unsupportedDegrees = [...new Set(tokens.filter((token) => !allowedDegrees.has(token)))];
    result.push({
      id: `${score.id}:${phrase[0]!.startBeat}:${phraseLength}`,
      scoreId: score.id,
      title: score.title ?? "Untitled",
      ...(score.keySignature !== undefined ? { keySignature: score.keySignature } : {}),
      startBeat: phrase[0]!.startBeat,
      endBeat: phrase[phrase.length - 1]!.startBeat + phrase[phrase.length - 1]!.durationBeats,
      degrees: tokens,
      unsupportedDegrees,
      answerLabel: degrees.map((degree) => degree!.label).join(", "),
      midiNotes: phrase.map(({ midiNote }) => midiNote),
      playback: phrase.map((note) => ({
        midiNotes: [note.midiNote],
        offsetSeconds: round(secondsAtBeat(note.startBeat - phrase[0]!.startBeat, score)),
        durationSeconds: round(secondsAtBeat(note.durationBeats, score)),
      })),
    });
  }

  return result;
}

export type RepertoireReviewStatus = "new" | "due" | "strong";

export interface RepertoireReviewItem {
  transfer: RepertoireEarTransfer;
  /** new = a degree never practiced; due = decayed mastery is low; strong = high & recent. */
  status: RepertoireReviewStatus;
  /** Higher = more worth reviewing. New phrases outrank reviewed ones; weaker outranks stronger. */
  priority: number;
  /** 0-1 estimate from melodic range, leap size, and chromatic scale degrees. */
  phraseDifficulty: number;
  weakestSkillId: string;
  /** The weakest degree's mastery after the forgetting curve (0-1). */
  decayedMastery: number;
}

export interface RepertoireReviewQueueOptions {
  phraseLength?: number;
  scaleDegreeSet?: ScaleDegreeSetId;
  /** Phrases to harvest per song before ranking. */
  phrasesPerSong?: number;
  /** UnixMs "now" for the forgetting curve; omit to skip decay. */
  now?: number;
  /** Cap on the returned queue length. */
  limit?: number;
  dueBelow?: number;
  strongAbove?: number;
}

export type RepertoireReviewPlanSectionId = "warmup" | "review" | "new" | "stretch";

export interface RepertoireReviewPlanSection {
  id: RepertoireReviewPlanSectionId;
  title: string;
  goal: string;
  items: RepertoireReviewItem[];
}

export interface RepertoireReviewPlan {
  sections: RepertoireReviewPlanSection[];
  recommendedOrder: RepertoireReviewItem[];
  totalItems: number;
}

export interface RepertoireReviewPlanOptions {
  warmupCount?: number;
  reviewCount?: number;
  newCount?: number;
  stretchCount?: number;
}

/**
 * Project all saved songs into one ranked ear-training review queue. Each phrase
 * is scored by its weakest scale-degree skill (after the shared forgetting-curve
 * decay), so the same list browses everything, surfaces new material, and floats
 * stale/weak phrases for review — no per-phrase SRS persistence needed.
 */
export function buildRepertoireReviewQueue(
  scores: Score[],
  getMastery: (skillId: string) => SkillMastery,
  options: RepertoireReviewQueueOptions = {},
): RepertoireReviewItem[] {
  const limit = Math.max(1, Math.floor(options.limit ?? 6));
  const strongAbove = options.strongAbove ?? 0.8;
  const now = options.now;

  const items: RepertoireReviewItem[] = [];
  for (const score of scores) {
    const transfers = buildRepertoireEarTransfers(score, {
      ...(options.phraseLength !== undefined ? { phraseLength: options.phraseLength } : {}),
      ...(options.scaleDegreeSet !== undefined ? { scaleDegreeSet: options.scaleDegreeSet } : {}),
      maxPrompts: Math.max(1, Math.floor(options.phrasesPerSong ?? 8)),
    });

    for (const transfer of transfers) {
      const skillIds = [
        ...new Set(transfer.degrees.map((degree) => `pitch.scale-degree.${degree}`)),
      ];
      let weakest = { id: skillIds[0] ?? "pitch.scale-degree.1", decayed: 1, observations: 0 };
      for (const id of skillIds) {
        const mastery = getMastery(id);
        const decayed =
          now === undefined ? mastery.mastery : applyDecay(mastery, unixMs(now)).mastery;
        if (decayed < weakest.decayed) {
          weakest = { id, decayed, observations: mastery.observations };
        }
      }

      const status: RepertoireReviewStatus =
        weakest.observations === 0 ? "new" : weakest.decayed >= strongAbove ? "strong" : "due";
      const phraseDifficulty = estimateRepertoirePhraseDifficulty(transfer);
      const priority = 1 - weakest.decayed + (status === "new" ? 1 : 0) + phraseDifficulty * 0.25;
      items.push({
        transfer,
        status,
        priority,
        phraseDifficulty,
        weakestSkillId: weakest.id,
        decayedMastery: weakest.decayed,
      });
    }
  }

  return items
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        left.transfer.title.localeCompare(right.transfer.title) ||
        left.transfer.startBeat - right.transfer.startBeat,
    )
    .slice(0, limit);
}

export function buildRepertoireReviewPlan(
  queue: RepertoireReviewItem[],
  options: RepertoireReviewPlanOptions = {},
): RepertoireReviewPlan {
  const used = new Set<string>();
  const warmup = takeItems(
    queue
      .filter((item) => item.status === "strong")
      .sort(
        (left, right) =>
          left.phraseDifficulty - right.phraseDifficulty || right.priority - left.priority,
      ),
    options.warmupCount ?? 1,
    used,
  );
  const review = takeItems(
    queue.filter((item) => item.status === "due").sort(byPriority),
    options.reviewCount ?? 3,
    used,
  );
  const fresh = takeItems(
    queue.filter((item) => item.status === "new").sort(byPriority),
    options.newCount ?? 2,
    used,
  );
  const stretch = takeItems(
    queue
      .filter((item) => !used.has(item.transfer.id))
      .sort(
        (left, right) =>
          right.phraseDifficulty - left.phraseDifficulty || right.priority - left.priority,
      ),
    options.stretchCount ?? 1,
    used,
  );
  const sections = (
    [
      {
        id: "warmup",
        title: "Warm up",
        goal: "Start with a familiar phrase so the key center and answer surface are stable.",
        items: warmup,
      },
      {
        id: "review",
        title: "Review due",
        goal: "Revisit weak or stale phrases before introducing more material.",
        items: review,
      },
      {
        id: "new",
        title: "New material",
        goal: "Introduce a small amount of unpracticed repertoire transfer.",
        items: fresh,
      },
      {
        id: "stretch",
        title: "Stretch",
        goal: "End with the highest-difficulty remaining phrase for challenge without overloading the session.",
        items: stretch,
      },
    ] satisfies RepertoireReviewPlanSection[]
  ).filter(({ items }) => items.length > 0);
  const recommendedOrder = sections.flatMap(({ items }) => items.map((item) => ({ ...item })));
  return {
    sections,
    recommendedOrder,
    totalItems: recommendedOrder.length,
  };
}

export function buildRepertoireReviewPlanSchedule(plan: RepertoireReviewPlan): ScheduledExercise[] {
  return plan.recommendedOrder.map((item) => ({
    exerciseId: `ear.repertoire-transfer.${safeId(item.transfer.id)}`,
    targetSkillIds: [`pitch.scale-degree.${item.transfer.degrees[0] ?? "1"}`],
    difficulty: round(clamp01(0.4 + item.phraseDifficulty * 0.4)),
    reason: item.status === "new" ? "new" : "review",
  }));
}

export function estimateRepertoirePhraseDifficulty(transfer: RepertoireEarTransfer): number {
  if (transfer.midiNotes.length < 2) return 0;

  const midiNotes = transfer.midiNotes;
  const range = Math.max(...midiNotes) - Math.min(...midiNotes);
  const intervals = midiNotes
    .slice(1)
    .map((midiNote, index) => Math.abs(midiNote - midiNotes[index]!));
  const largestLeap = Math.max(...intervals);
  const leapLoad =
    intervals.reduce((total, interval) => total + Math.max(0, interval - 2), 0) /
    Math.max(1, intervals.length * 12);
  const chromaticRatio =
    transfer.degrees.filter((degree) => degree.includes("#") || degree.includes("b")).length /
    transfer.degrees.length;

  return clamp01(
    (range / 24) * 0.3 + (largestLeap / 12) * 0.25 + leapLoad * 0.25 + chromaticRatio * 0.2,
  );
}

function takeItems(
  items: RepertoireReviewItem[],
  count: number,
  used: Set<string>,
): RepertoireReviewItem[] {
  const result: RepertoireReviewItem[] = [];
  for (const item of items) {
    if (result.length >= Math.max(0, Math.floor(count))) break;
    if (used.has(item.transfer.id)) continue;
    used.add(item.transfer.id);
    result.push({ ...item });
  }
  return result;
}

function byPriority(left: RepertoireReviewItem, right: RepertoireReviewItem): number {
  return (
    right.priority - left.priority ||
    right.phraseDifficulty - left.phraseDifficulty ||
    left.transfer.title.localeCompare(right.transfer.title) ||
    left.transfer.startBeat - right.transfer.startBeat
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createRepertoireTransferExercise(
  transfer: RepertoireEarTransfer,
): ExerciseDefinition<RepertoireTransferPrompt, string[]> {
  const targetSkillId = `pitch.scale-degree.${transfer.degrees[0] ?? "1"}`;
  return {
    id: `ear.repertoire-transfer.${safeId(transfer.id)}`,
    name: "Repertoire Transfer",
    capabilities: [Capability.EarTraining, Capability.Pitch],
    skillIds: [targetSkillId],
    inputs: ["midi", "onscreen"],
    streaming: false,
    generate() {
      return {
        id: `repertoire-transfer-${safeId(transfer.id)}`,
        payload: {
          drill: "repertoire-transfer",
          targetSkillId,
          answerToken: transfer.degrees.join("-"),
          answerLabel: transfer.answerLabel,
          choices: [],
          playback: transfer.playback.map((step) => ({ ...step, midiNotes: [...step.midiNotes] })),
          requiredPlayedNotes: transfer.midiNotes.length,
          sourceScoreId: transfer.scoreId,
          sourceTitle: transfer.title,
          sourceStartBeat: transfer.startBeat,
          sourceEndBeat: transfer.endBeat,
          degrees: [...transfer.degrees],
          targetMidiNotes: [...transfer.midiNotes],
        },
      };
    },
    createRun(prompt) {
      return earTrainingRun(prompt.payload, (input) =>
        gradeRepertoireTransfer(prompt.payload, input),
      );
    },
  };
}

function gradeRepertoireTransfer(
  prompt: RepertoireTransferPrompt,
  input: NoteEvent[],
): ExerciseResult<string[]> {
  const notes = playedMidiNotes(input).slice(0, prompt.targetMidiNotes.length);
  const answer = notes.map((midiNote) => degreeForMidi(prompt, midiNote));
  const matches = prompt.targetMidiNotes.filter((expected, index) =>
    samePitchClass(expected, notes[index]),
  ).length;
  const score = matches / prompt.targetMidiNotes.length;
  const correct = score === 1;
  const metrics: ScoringMetric[] = prompt.targetMidiNotes.map((expectedMidi, index) => ({
    kind: "pitch",
    expectedMidi,
    actualMidi: notes[index],
  }));

  return {
    correct,
    score,
    metrics,
    feedback: [
      correct
        ? { severity: "good", message: `Correct - ${prompt.answerLabel}.` }
        : {
            severity: "error",
            message: `Phrase from ${prompt.sourceTitle}: ${prompt.answerLabel}.`,
          },
    ],
    target: {
      label: prompt.answerLabel,
      choice: prompt.answerToken,
      midiNotes: prompt.targetMidiNotes,
    },
    response: {
      label: answer.join(", "),
      choice: answer.join("-"),
      midiNotes: notes,
    },
    answer,
    input,
  };
}

function tonicMidiForKey(keySignature?: string): number | undefined {
  if (!keySignature) return undefined;
  const token = keySignature.trim().split(/\s+/)[0]?.replace("♭", "b").replace("♯", "#");
  if (!token) return undefined;
  const pitchClasses: Record<string, number> = {
    C: 0,
    "C#": 1,
    Db: 1,
    D: 2,
    "D#": 3,
    Eb: 3,
    E: 4,
    F: 5,
    "F#": 6,
    Gb: 6,
    G: 7,
    "G#": 8,
    Ab: 8,
    A: 9,
    "A#": 10,
    Bb: 10,
    B: 11,
  };
  const pitchClass = pitchClasses[token];
  return pitchClass === undefined ? undefined : 60 + pitchClass;
}

function secondsAtBeat(beat: number, score: Score): number {
  const bpm = [...score.tempoMap].sort((left, right) => left.atBeat - right.atBeat)[0]?.bpm ?? 120;
  return (beat * 60) / bpm;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function degreeForMidi(prompt: RepertoireTransferPrompt, midiNote: number): string {
  const matchIndex = prompt.targetMidiNotes.findIndex((expected) =>
    samePitchClass(expected, midiNote),
  );
  if (matchIndex >= 0) return prompt.degrees[matchIndex]!;
  return `${((midiNote % 12) + 12) % 12}`;
}

function samePitchClass(expected?: number, actual?: number): boolean {
  return (
    expected !== undefined && actual !== undefined && (((expected - actual) % 12) + 12) % 12 === 0
  );
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}
