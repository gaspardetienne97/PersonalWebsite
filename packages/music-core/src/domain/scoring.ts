import type { InstrumentId } from "./instrument";
import type { InputSource } from "./note-event";
import type { Capability } from "./capability";
import type { PracticeModality } from "./modality";
import type { UnixMs } from "./time";

/**
 * ScoringMetric - a structured, typed record of one measured dimension of an
 * answer. This is the single biggest upgrade over v1: instead of a bare
 * `correct: boolean`, we capture *what was asked and what was given*, which is
 * exactly what the analytics engine needs to build a confusion matrix
 * ("heard m6, answered P5") and per-dimension feedback ("missing the b9",
 * "snare 42ms late", "finger 4 weak").
 *
 * Discriminated on `kind` so each metric type carries the right fields.
 */
export type ScoringMetric =
  | { kind: "pitch"; expectedMidi: number; actualMidi?: number; cents?: number }
  | { kind: "timing"; expectedMs: number; actualMs: number; errorMs: number }
  | { kind: "velocity"; expected: number; actual: number }
  | { kind: "choice"; expected: string; actual?: string }
  | {
      kind: "chord";
      expectedPitchClasses: number[];
      actualPitchClasses: number[];
      /** Derived diagnostics - what specifically was wrong about the chord. */
      missingPitchClasses?: number[];
      extraPitchClasses?: number[];
      expectedBass?: number;
      actualBass?: number;
      inversionCorrect?: boolean;
    }
  | {
      kind: "voice-leading";
      fromMidi: number[];
      actualMidi: number[];
      register: [number, number];
      membershipCorrect: boolean;
      /** Undefined unless exactly two distinct pitches were observed. */
      actualSemitones?: number;
      minimumSemitones: number;
    }
  | {
      kind: "chord-changes";
      tuningId: string;
      durationSeconds: number;
      fromShapeId: string;
      fromMidiNotes: number[];
      toShapeId: string;
      toMidiNotes: number[];
      completedChanges: number;
      cleanChanges: number;
      changesPerMinute: number;
    }
  | { kind: "breath"; steadiness: number; targetCurve?: number[]; actualCurve?: number[] };

/** What the exercise asked for (structured target), for analytics + review. */
export interface ScoringTarget {
  /** Free-form label, e.g. "minor 6th", "G7b9", "quarter-note groove". */
  label: string;
  /** Expected pitches as MIDI numbers, when applicable. */
  midiNotes?: number[];
  /** Expected answer token for choice-style exercises. */
  choice?: string;
}

/** What the user actually produced. */
export interface ScoringResponse {
  label?: string;
  midiNotes?: number[];
  choice?: string;
}

/**
 * ScoringEvent - the atomic, immutable record of one graded attempt.
 *
 * Central data flow seam:
 *
 *   Exercise grading -> ScoringEvent -> Analytics -> LearningEvidence -> Skill Graph (mastery)
 *                                    -> Progress  -> XP / streak / achievements
 *                                    -> PracticeSession (collected)
 *
 * Carries `skillIds` + `capabilities` (copied from the exercise definition at
 * run time) so every attempt is attributable, plus rich `metrics` + optional
 * `target`/`response` so it is attributable *and* diagnosable.
 */
export interface ScoringEvent {
  id: string;
  sessionId: string;
  exerciseId: string;
  /** The specific run within the session that produced this event. */
  runId?: string;
  skillIds: string[];
  capabilities: Capability[];
  /** How the skill was exercised this time (played/heard/read/...). */
  modality?: PracticeModality;
  /** Observed input used to grade the answer; absent when no input was captured. */
  source?: InputSource | "mixed";
  /** Observed or explicitly configured instrument; never inferred from a default. */
  instrument?: InstrumentId;
  /** Assistance explicitly known for this run; missing historical values remain unknown. */
  assistance?: "independent" | "hinted" | "guided" | "self-assessed";
  /** WALL-CLOCK time of the attempt (history, not timing). */
  at: UnixMs;

  /** Coarse pass/fail retained for quick filters and back-compat. */
  correct: boolean;
  /** Graded credit 0-1; music is rarely binary (e.g. 3/4 chord tones). */
  partialCredit: number;
  /** Difficulty the item was presented at, 0-1 (weights derived evidence). */
  difficulty: number;
  /** Time from prompt presentation to completed response, when measured. */
  latencyMs?: number;

  /** Per-dimension structured measurements. */
  metrics: ScoringMetric[];
  target?: ScoringTarget;
  response?: ScoringResponse;
}

/** Strict eligibility for claims of unaided mastery, including historical projections. */
export function isMasteryEligible(event: Pick<ScoringEvent, "assistance">): boolean {
  return event.assistance === "independent";
}
