/**
 * chord-follower — pure streaming grader for a known chord progression.
 *
 * It never does open chord recognition: it aligns a stream of pitch-class
 * observations (from chroma + onset-confirmed Basic Pitch, supplied by Phase 2)
 * against an expected progression, grading each chord on correctness + timing.
 * Mirrors the monophonic `score-follower`'s shape.
 */

import {
  beatToMs,
  timingWindowMs,
  type TimingStrictness,
} from "@repo/music-core/engines/score-follower";
import { chordNotes, pitchClass } from "@repo/music-core/engines/theory";
import type { JamProgression } from "@repo/music-core/engines/jam";

export interface ExpectedChord {
  symbol: string;
  /** Sorted, deduped chord-tone pitch classes. */
  pitchClasses: number[];
  startBeat: number;
  durationBeats: number;
}

export function expectedChordsFromProgression(
  progression: JamProgression,
  options: { beatsPerBar?: number } = {},
): ExpectedChord[] {
  const beatsPerBar = options.beatsPerBar ?? 4;
  let startBeat = 0;
  return progression.chords.map((chord) => {
    const durationBeats = chord.bars * beatsPerBar;
    const pitchClasses = [
      ...new Set(chordNotes(chord.symbol).map((note) => pitchClass(note))),
    ].sort((left, right) => left - right);
    const expected: ExpectedChord = {
      symbol: chord.symbol,
      pitchClasses,
      startBeat,
      durationBeats,
    };
    startBeat += durationBeats;
    return expected;
  });
}

export type ChordObservationSource = "chroma" | "onset";

export interface ChordObservation {
  pitchClasses: number[];
  /** Reserved for Phase 2 chroma/onset fusion; not yet weighted in Phase 1. */
  confidence: number;
  source: ChordObservationSource;
  atMs: number;
}

export type ChordTimingBand = "early" | "in-time" | "late" | "missed";

export interface ChordGrade {
  symbol: string;
  matched: boolean;
  coverage: number;
  timingBand: ChordTimingBand;
  atMs?: number;
}

export interface ChordFollowerOptions {
  bpm: number;
  /** Wall-clock time of beat 0 (the progression downbeat). */
  startAtMs: number;
  strictness?: TimingStrictness;
  /** Coverage of the expected template needed to count a chord as voiced. */
  matchThreshold?: number;
  /** Coverage of the NEXT chord that triggers advancing. */
  advanceThreshold?: number;
}

export interface ChordFollowerState {
  currentIndex: number;
  done: boolean;
  grades: ChordGrade[];
  detectedPitchClasses: number[];
}

export interface ChordFollowerSummary {
  grades: ChordGrade[];
  correct: number;
  total: number;
  score: number;
}

export interface ChordFollowerRun {
  accept(observation: ChordObservation): ChordFollowerState;
  state(): ChordFollowerState;
  finish(): ChordFollowerSummary;
}

function coverage(observed: number[], template: number[]): number {
  if (template.length === 0) return 0;
  const set = new Set(observed);
  let matched = 0;
  for (const pitchClass of template) if (set.has(pitchClass)) matched++;
  return matched / template.length;
}

// Mirrors chord-verification's extra-tone penalty: a chord shouldn't grade clean
// if the observation is flooded with non-chord tones. Tune in Phase 4 (hardware).
const EXTRA_TONE_PENALTY = 0.25;

function extraToneRatio(observed: number[], template: number[]): number {
  if (template.length === 0) return 0;
  const set = new Set(template);
  let extra = 0;
  for (const pitchClass of observed) if (!set.has(pitchClass)) extra++;
  return extra / template.length;
}

export function createChordFollower(
  expected: ExpectedChord[],
  options: ChordFollowerOptions,
): ChordFollowerRun {
  const matchThreshold = options.matchThreshold ?? 0.75;
  const advanceThreshold = options.advanceThreshold ?? 0.6;
  const strictness = options.strictness ?? "normal";

  const grades: ChordGrade[] = [];
  let currentIndex = 0;
  let currentBest = 0;
  let bestExtraRatio = 0;
  let firstHitMs: number | undefined;
  let detected: number[] = [];

  function timingBand(chord: ExpectedChord, atMs: number | undefined): ChordTimingBand {
    if (atMs === undefined) return "missed";
    const downbeat = options.startAtMs + beatToMs(chord.startBeat, options.bpm);
    const window = timingWindowMs({
      bpm: options.bpm,
      durationBeats: chord.durationBeats,
      strictness,
    });
    const delta = atMs - downbeat;
    if (Math.abs(delta) <= window) return "in-time";
    return delta < 0 ? "early" : "late";
  }

  function finalizeCurrent(): void {
    const chord = expected[currentIndex];
    if (!chord) return;
    const matchScore = Math.max(0, currentBest - EXTRA_TONE_PENALTY * bestExtraRatio);
    const matched = matchScore >= matchThreshold;
    grades.push({
      symbol: chord.symbol,
      matched,
      coverage: currentBest,
      timingBand: matched ? timingBand(chord, firstHitMs) : "missed",
      ...(matched && firstHitMs !== undefined ? { atMs: firstHitMs } : {}),
    });
    currentBest = 0;
    bestExtraRatio = 0;
    firstHitMs = undefined;
  }

  function applyTo(index: number, observation: ChordObservation): void {
    const cover = coverage(observation.pitchClasses, expected[index]!.pitchClasses);
    if (cover > currentBest) {
      currentBest = cover;
      bestExtraRatio = extraToneRatio(observation.pitchClasses, expected[index]!.pitchClasses);
    }
    if (cover >= matchThreshold && firstHitMs === undefined) firstHitMs = observation.atMs;
  }

  function snapshot(): ChordFollowerState {
    return {
      currentIndex,
      done: currentIndex >= expected.length,
      grades: [...grades],
      detectedPitchClasses: [...detected],
    };
  }

  return {
    accept(observation) {
      detected = [...observation.pitchClasses];
      if (currentIndex >= expected.length) return snapshot();

      // Keep advancing while we match the next chord better than the current
      while (true) {
        const next = expected[currentIndex + 1];
        if (!next) break; // No more chords to advance to

        const coverNext = coverage(observation.pitchClasses, next.pitchClasses);
        const coverCurrent = coverage(
          observation.pitchClasses,
          expected[currentIndex]!.pitchClasses,
        );

        // Advance if:
        // 1. We've already matched the current chord (currentBest >= matchThreshold), OR
        // 2. The next chord is clearly better (coverNext >= advanceThreshold AND better than current)
        const shouldAdvance =
          (currentBest >= matchThreshold && coverNext > coverCurrent) ||
          (coverNext >= advanceThreshold && coverNext > coverCurrent);

        if (shouldAdvance) {
          finalizeCurrent();
          currentIndex += 1;
        } else {
          break;
        }
      }

      applyTo(currentIndex, observation);
      return snapshot();
    },
    state: snapshot,
    finish() {
      while (currentIndex < expected.length) {
        finalizeCurrent();
        currentIndex += 1;
      }
      const correct = grades.filter((grade) => grade.matched).length;
      const total = expected.length;
      const score =
        total === 0
          ? 0
          : grades.reduce(
              (sum, grade) =>
                sum + (grade.matched ? (grade.timingBand === "in-time" ? 1 : 0.6) : 0),
              0,
            ) / total;
      return { grades: [...grades], correct, total, score };
    },
  };
}
