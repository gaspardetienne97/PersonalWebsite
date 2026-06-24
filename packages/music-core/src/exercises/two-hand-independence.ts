/**
 * Two-hand independence — a piano coordination drill. The left hand holds a
 * steady root pulse (one note per beat) while the right hand plays a faster
 * scale line (two notes per beat), so the hands move at different rates. Each
 * hand is graded independently: notes are sorted into hands by register (a
 * split point between the two octaves), then matched in order, so you have to
 * keep the left steady while the right runs its own line.
 *
 * MIDI-first and on-screen friendly: it consumes normalized noteOn events and
 * advances `technique.piano.two-hand-independence` through the standard
 * exercise pipeline (scoring → skills → XP).
 */

import {
  Capability,
  type ExerciseDefinition,
  type ExerciseResult,
  type ExerciseRun,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { midiToNote, noteToMidi } from "@repo/music-core/engines/theory";

export interface TwoHandIndependenceOptions {
  /** Right-hand starting note, e.g. "C4". The left-hand root sits two octaves below. */
  tonic?: string;
  bpm?: number;
  /** Number of 4/4 bars. */
  bars?: number;
}

export interface TwoHandIndependencePrompt {
  label: string;
  /** Left hand: a steady root pulse, one note per beat. */
  leftMidiNotes: number[];
  /** Right hand: an eighth-note scale line, two notes per beat. */
  rightMidiNotes: number[];
  leftNoteLabels: string[];
  rightNoteLabels: string[];
  /** Notes at or above this midi belong to the right hand; below, the left. */
  splitMidi: number;
  bpm: number;
  beatMs: number;
}

export interface TwoHandIndependenceAnswer {
  leftPlayed: number[];
  rightPlayed: number[];
  leftAccuracy: number;
  rightAccuracy: number;
  /** Mean deviation from the expected note spacing, in ms — the evenness signal. */
  meanEvennessErrorMs: number;
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

export function createTwoHandIndependenceExercise(
  options: TwoHandIndependenceOptions = {},
): ExerciseDefinition<TwoHandIndependencePrompt, TwoHandIndependenceAnswer> {
  const tonic = options.tonic ?? "C4";
  const bpm = options.bpm ?? 100;
  const bars = options.bars ?? 2;
  const beatMs = 60_000 / bpm;

  const rhRoot = noteToMidi(tonic);
  const lhRoot = rhRoot - 24;
  const beats = bars * 4;

  // Left hand: one root per beat.
  const leftMidiNotes = Array.from({ length: beats }, () => lhRoot);
  // Right hand: two notes per beat, ascending the scale and back down.
  const span = MAJOR_STEPS.length * 2;
  const rightMidiNotes = Array.from({ length: beats * 2 }, (_, index) => {
    const phase = index % span;
    const step = phase < MAJOR_STEPS.length ? phase : span - 1 - phase;
    return rhRoot + MAJOR_STEPS[step]!;
  });

  const splitMidi = Math.floor((lhRoot + rhRoot) / 2);
  const label = `${pitchClassLabel(tonic)} two-hand independence`;

  return {
    id: "technique.piano.two-hand-independence",
    name: "Two-Hand Independence",
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds: ["technique.piano", "technique.piano.two-hand-independence"],
    inputs: ["midi", "onscreen"],
    streaming: true,
    generate: () => ({
      id: `two-hand-${pitchClassLabel(tonic).toLowerCase()}-${bpm}-${bars}`,
      payload: {
        label,
        leftMidiNotes,
        rightMidiNotes,
        leftNoteLabels: leftMidiNotes.map((midi) => midiToNote(midi)),
        rightNoteLabels: rightMidiNotes.map((midi) => midiToNote(midi)),
        splitMidi,
        bpm,
        beatMs,
      },
    }),
    createRun(prompt) {
      return twoHandRun(prompt.payload);
    },
  };
}

function twoHandRun(prompt: TwoHandIndependencePrompt): ExerciseRun<TwoHandIndependenceAnswer> {
  const input: NoteEvent[] = [];
  const total = prompt.leftMidiNotes.length + prompt.rightMidiNotes.length;

  return {
    accept(event) {
      if (event.type === "noteOn") input.push(event);
    },
    getLiveState() {
      const progress = total === 0 ? 0 : Math.min(1, input.length / total);
      return { progress, runningScore: progress, feedback: [] };
    },
    finish() {
      return gradeTwoHand(prompt, input);
    },
  };
}

function gradeTwoHand(
  prompt: TwoHandIndependencePrompt,
  input: NoteEvent[],
): ExerciseResult<TwoHandIndependenceAnswer> {
  const played = input.filter((event) => event.type === "noteOn");
  const leftPlayed = played.filter((event) => event.midiNote < prompt.splitMidi);
  const rightPlayed = played.filter((event) => event.midiNote >= prompt.splitMidi);

  const left = gradeHand(prompt.leftMidiNotes, leftPlayed, prompt.beatMs);
  const right = gradeHand(prompt.rightMidiNotes, rightPlayed, prompt.beatMs / 2);

  const totalNotes = prompt.leftMidiNotes.length + prompt.rightMidiNotes.length;
  const pitchScore = (left.correct + right.correct) / totalNotes;
  const evennessErrors = [...left.spacingErrors, ...right.spacingErrors];
  const meanEvennessError =
    evennessErrors.length === 0
      ? 0
      : evennessErrors.reduce((sum, error) => sum + error, 0) / evennessErrors.length;
  const evennessScore = Math.max(0, 1 - meanEvennessError / 180);
  const score = pitchScore * 0.8 + evennessScore * 0.2;

  const leftAccuracy =
    prompt.leftMidiNotes.length === 0 ? 0 : left.correct / prompt.leftMidiNotes.length;
  const rightAccuracy =
    prompt.rightMidiNotes.length === 0 ? 0 : right.correct / prompt.rightMidiNotes.length;

  return {
    correct: score >= 0.9,
    score,
    metrics: [...left.metrics, ...right.metrics],
    feedback: [
      {
        severity: score >= 0.9 ? "good" : "warn",
        message: `LH ${left.correct}/${prompt.leftMidiNotes.length} steady · RH ${right.correct}/${prompt.rightMidiNotes.length} line.`,
      },
    ],
    target: { label: prompt.label, midiNotes: [...prompt.leftMidiNotes, ...prompt.rightMidiNotes] },
    response: { midiNotes: played.map((event) => event.midiNote) },
    answer: {
      leftPlayed: leftPlayed.map((event) => event.midiNote),
      rightPlayed: rightPlayed.map((event) => event.midiNote),
      leftAccuracy,
      rightAccuracy,
      meanEvennessErrorMs: meanEvennessError,
    },
    input,
  };
}

function gradeHand(
  expected: number[],
  played: NoteEvent[],
  spacingMs: number,
): { correct: number; metrics: ScoringMetric[]; spacingErrors: number[] } {
  const metrics: ScoringMetric[] = [];
  let correct = 0;
  expected.forEach((expectedMidi, index) => {
    const actual = played[index];
    const actualMidi = actual?.type === "noteOn" ? actual.midiNote : undefined;
    metrics.push({ kind: "pitch", expectedMidi, actualMidi });
    if (actualMidi === expectedMidi) correct += 1;
  });

  const spacingErrors = played
    .slice(1)
    .map((event, index) =>
      Math.abs(Number(event.timestamp) - Number(played[index]!.timestamp) - spacingMs),
    );

  return { correct, metrics, spacingErrors };
}

function pitchClassLabel(note: string): string {
  return note.trim().replace(/-?\d+$/, "");
}
