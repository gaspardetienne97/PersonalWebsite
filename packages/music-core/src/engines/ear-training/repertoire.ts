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
  const dueBelow = options.dueBelow ?? 0.5;
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
      const priority = 1 - weakest.decayed + (status === "new" ? 1 : 0);
      items.push({
        transfer,
        status,
        priority,
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
