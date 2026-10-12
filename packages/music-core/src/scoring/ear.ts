// Ear training: choice answers and play-back answers.
import data from "../data/cadences-and-chord-qualities.json";
import type { Metric } from "../types";
import { pc } from "../theory/notes";
import { type Graded, pcSet } from "./grade";

const binary = (correct: boolean, metrics: Metric[]): Graded => ({
  score: correct ? 1 : 0,
  correct,
  metrics,
  notMeasured: [],
});

/** Any choice-button answer (intervals, qualities, cadences, degrees). */
export function gradeChoice(expected: string, actual: string | undefined): Graded {
  return binary(actual === expected, [{ kind: "choice", expected, actual }]);
}

/** Answers given in order (a progression's chords): partial credit per slot. */
export function gradeSequence(expected: readonly string[], actual: readonly string[]): Graded {
  const right = expected.filter((t, i) => actual[i] === t).length;
  const score = expected.length ? right / expected.length : 0;
  return {
    score,
    correct: score === 1,
    metrics: expected.map((t, i) => ({ kind: "choice", expected: t, actual: actual[i] })),
    notMeasured: [],
  };
}

/** Played interval: the first two notes; any starting pitch, direction must match unless harmonic. */
export function gradeIntervalPlayback(
  prompt: { semitones: number; direction: "ascending" | "descending" | "harmonic" },
  played: readonly number[],
): Graded & { playedSemitones?: number } {
  if (played.length < 2) return { ...binary(false, []), playedSemitones: undefined };
  const [a, b] = played;
  const d = b - a;
  const correct =
    prompt.direction === "harmonic"
      ? Math.abs(d) === prompt.semitones
      : d === (prompt.direction === "ascending" ? prompt.semitones : -prompt.semitones);
  const expectedMidi =
    prompt.direction === "descending" || (prompt.direction === "harmonic" && d < 0)
      ? a - prompt.semitones
      : a + prompt.semitones;
  return {
    ...binary(correct, [{ kind: "pitch", expectedMidi, actualMidi: b }]),
    playedSemitones: d,
  };
}

/** The named quality whose interval shape the pitch-class set matches from some root. */
export function classifyChord(midis: readonly number[]): { token: string; rootPc: number } | null {
  const pcs = pcSet(midis);
  for (const q of data.chordQualities)
    for (const root of pcs) {
      const shape = pcSet(pcs.map((p) => p - root));
      if (shape.length === q.intervals.length && shape.every((s, i) => s === q.intervals[i]))
        return { token: q.token, rootPc: root };
    }
  return null;
}

/** Played chord quality: binary on pitch-class shape, inversion-agnostic, any root. */
export function gradeChordQualityPlayback(
  expectedToken: string,
  played: readonly number[],
): Graded & { detected: string | null } {
  const quality = data.chordQualities.find((q) => q.token === expectedToken);
  if (!quality) throw new Error(`unknown chord quality ${expectedToken}`);
  const actualPcs = pcSet(played);
  const found = classifyChord(played);
  const rootPc = found?.rootPc ?? (played.length ? pc(Math.min(...played)) : 0);
  const expectedPcs = pcSet(quality.intervals.map((i) => rootPc + i));
  const correct = found?.token === expectedToken;
  return {
    ...binary(correct, [
      {
        kind: "chord",
        expectedPcs,
        actualPcs,
        missing: expectedPcs.filter((p) => !actualPcs.includes(p)),
        extra: actualPcs.filter((p) => !expectedPcs.includes(p)),
      },
    ]),
    detected: found?.token ?? null,
  };
}

/** Melody dictation and repertoire transfer: position-wise pitch-class match, correct only at 1.0. */
export function gradeMelodyDictation(
  expected: readonly number[],
  played: readonly number[],
): Graded & { matched: number; total: number } {
  const matches = expected.map((m, i) => played[i] !== undefined && pc(played[i]) === pc(m));
  const matched = matches.filter(Boolean).length;
  const score = expected.length ? matched / expected.length : 0;
  return {
    score,
    correct: score === 1,
    metrics: expected.map((m, i) => ({ kind: "pitch", expectedMidi: m, actualMidi: played[i] })),
    notMeasured: [],
    matched,
    total: expected.length,
  };
}

/** Scale degree answered by playing or singing: the answer's pitch class relative to the tonic. */
export function gradeScaleDegree(
  tonicMidi: number,
  degreeSemitones: number,
  answer: { midi: number; cents?: number } | null,
): Graded {
  const correct = answer !== null && pc(answer.midi - tonicMidi) === pc(degreeSemitones);
  return binary(correct, [
    {
      kind: "pitch",
      expectedMidi: tonicMidi + degreeSemitones,
      actualMidi: answer?.midi,
      cents: answer?.cents,
    },
  ]);
}
