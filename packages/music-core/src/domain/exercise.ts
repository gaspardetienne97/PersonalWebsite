import type { Capability } from "./capability";
import type { InstrumentId } from "./instrument";
import type { NoteEvent, InputSource } from "./note-event";
import type { ScoringMetric, ScoringTarget, ScoringResponse } from "./scoring";

/**
 * ExerciseDefinition - the reusable unit of training.
 *
 * Two properties make the architecture cohere:
 *  1. It is input-agnostic - it consumes normalized NoteEvents, answerable by
 *     MIDI, audio, on-screen, or click.
 *  2. It declares the Skill Graph nodes it advances (`skillIds`), so every
 *     graded attempt is attributable.
 *
 * v1.1 change: exercises run as a STREAMING RUN, not a single score() call.
 * Sight-reading, rhythm, spider drills, Aerophone breath, and MPC rudiments are
 * all temporal - they need live feedback as events arrive and a final tally.
 * The run model (createRun -> accept -> getLiveState -> finish) expresses that
 * naturally; discrete flashcard-style exercises just accept one batch and
 * finish (see `discreteRun` helper).
 *
 * Generic over prompt payload `P` and answer payload `A` so concrete exercises
 * stay strongly typed without the framework knowing their internals.
 */

export interface ExerciseContext {
  /** Skills this run should target (subset of the definition's `skillIds`). */
  targetSkillIds: string[];
  /** Adaptive difficulty chosen by the scheduler, 0-1. */
  difficulty: number;
  /** Instrument the user will answer on, when relevant. */
  instrument?: InstrumentId;
  /** Optional exercise-specific context that should stay framework-agnostic. */
  metadata?: Record<string, unknown>;
}

export interface ExercisePrompt<P = unknown> {
  id: string;
  /** Type-specific prompt data (the interval to identify, notes to play, ...). */
  payload: P;
  /** Optional score/audio to present (sight-reading, dictation, play-along). */
  scoreId?: string;
}

export type FeedbackSeverity = "info" | "good" | "warn" | "error";

export interface FeedbackItem {
  severity: FeedbackSeverity;
  message: string;
  /** Optional anchor: which prompt note / beat / metric this refers to. */
  ref?: string;
}

/**
 * ExerciseResult - the outcome of a finished run. Richer than v1: a continuous
 * `score`, structured `metrics`, and human `feedback`, because for a scale or
 * groove "correct/incorrect" loses everything that matters (uneven rhythm,
 * weak finger 4, rushed descending run, sharp intonation).
 */
export interface ExerciseResult<A = unknown> {
  /** Coarse pass/fail retained for quick filters. */
  correct: boolean;
  /** Continuous performance 0-1. */
  score: number;
  /** Prompt-presented -> first/seminal answer latency, ms (discrete items). */
  latencyMs?: number;
  metrics: ScoringMetric[];
  feedback: FeedbackItem[];
  target?: ScoringTarget;
  response?: ScoringResponse;
  /** Structured interpretation of the answer, for the review UI. */
  answer?: A;
  /** The normalized input that produced the answer (kept for analytics). */
  input: NoteEvent[];
}

/** Live, partial state for rolling on-screen feedback during a run. */
export interface ExerciseLiveState {
  /** Progress through the prompt, 0-1 (e.g. playhead position). */
  progress: number;
  /** Running score so far, 0-1. */
  runningScore: number;
  /** Transient feedback to surface right now (e.g. "behind the beat"). */
  feedback: FeedbackItem[];
  /**
   * Recent breath-controller samples, 0-1, oldest first (about the last 64).
   * Streaming wind exercises fill this so a stage can draw the envelope live.
   */
  breathTrace?: number[];
  /**
   * Recent pitch offsets from the exercise target in cents, oldest first, one
   * per attack. MIDI attacks are whole semitones (multiples of 100); audio
   * attacks with a detected frequency carry the real offset.
   */
  pitchTrace?: number[];
}

/** Why a run ended - recorded for journaling and analytics. */
export type ExerciseFinishReason = "completed" | "abandoned" | "skipped" | "timeout";

export interface ExerciseFinishContext {
  reason?: ExerciseFinishReason;
  /** Self-reported difficulty ("felt hard"), 0-1, optional. */
  perceivedEffort?: number;
}

/**
 * A live exercise run. Engines feed it NoteEvents as they arrive; the UI polls
 * getLiveState() for feedback; finish() produces the gradable result.
 */
export interface ExerciseRun<A = unknown> {
  accept(event: NoteEvent): void;
  getLiveState(): ExerciseLiveState;
  finish(ctx?: ExerciseFinishContext): ExerciseResult<A>;
}

export interface ExerciseDefinition<P = unknown, A = unknown> {
  id: string;
  name: string;
  /** One or more capabilities this exercise develops. */
  capabilities: Capability[];
  /** Skill Graph nodes this exercise can advance. */
  skillIds: string[];
  /** Input modalities supported (drives the Input Router + UI affordances). */
  inputs: InputSource[];
  /** True if scoring is temporal (sight-reading, rhythm, breath, rudiments). */
  streaming: boolean;

  /** Produce a prompt for the given context. */
  generate(ctx: ExerciseContext): ExercisePrompt<P>;

  /** Begin a run for a prompt. Discrete exercises return a one-shot run. */
  createRun(prompt: ExercisePrompt<P>, ctx: ExerciseContext): ExerciseRun<A>;
}

/**
 * Helper for discrete (non-streaming) exercises: buffers events and grades once
 * at finish() via a pure `grade` function, so flashcard-style exercises stay
 * trivial to write while sharing the run interface.
 */
export function discreteRun<A>(grade: (input: NoteEvent[]) => ExerciseResult<A>): ExerciseRun<A> {
  const input: NoteEvent[] = [];
  return {
    accept(event) {
      input.push(event);
    },
    getLiveState() {
      return { progress: input.length > 0 ? 1 : 0, runningScore: 0, feedback: [] };
    },
    finish(_ctx?: ExerciseFinishContext) {
      return grade(input);
    },
  };
}
