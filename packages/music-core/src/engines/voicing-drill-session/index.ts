/**
 * Voicing-drill session — sequences the rootless ii-V-I across all 12 keys as a
 * graded, XP-earning drill. Each chord runs through the standard
 * {@link ExerciseRunHost}, so scoring, skill mastery (`harmony.ii-v-i`), and XP
 * flow through the same pipeline as every other exercise.
 *
 * The grading mode adapts to the instrument: polyphonic instruments hold the
 * voicing as a chord; monophonic instruments (Aerophone, voice) play it as an
 * arpeggio.
 */

import { isMonophonic, type InstrumentId, type ScoringEvent } from "@repo/music-core/domain";
import { ExerciseRunHost, type PipelineServices } from "@repo/music-core/engines/exercise";
import type { InputRouter } from "@repo/music-core/engines/input-router";
import {
  buildDrillVoicings,
  type DrillVariant,
  type RootlessPosition,
} from "@repo/music-core/engines/jazz";
import {
  createVoicingDrillExercise,
  VOICING_DRILL_SKILL,
  type VoicingGradingMode,
  type VoicingTarget,
} from "@repo/music-core/exercises/voicing-drill";

const pitchClass = (midi: number): number => ((midi % 12) + 12) % 12;

/** Pure: the ordered list of chord targets for the 12-key ii-V-I drill. */
export function buildVoicingDrillTargets(
  instrument: InstrumentId,
  opts: { variant?: DrillVariant; startPosition?: RootlessPosition; strict?: boolean } = {},
): VoicingTarget[] {
  const mode: VoicingGradingMode = isMonophonic(instrument) ? "arpeggio" : "chord";

  return buildDrillVoicings(opts.variant ?? "major", opts.startPosition ?? "A").flatMap((step) =>
    step.chords.map((chord) => {
      const notes = chord.bassMidi === undefined ? chord.midi : [chord.bassMidi, ...chord.midi];
      const pcs = [...new Set(notes.map(pitchClass))];
      return {
        id: `${step.key}-${chord.symbol}`,
        symbol: chord.symbol,
        // Arpeggio is graded in ascending pitch order; chord order is irrelevant.
        expectedPitchClasses:
          mode === "arpeggio" ? [...notes].sort((a, b) => a - b).map(pitchClass) : pcs,
        expectedBassPc: chord.bassMidi === undefined ? undefined : pitchClass(chord.bassMidi),
        mode,
        // Held grading only applies to polyphonic (chord) targets.
        strict: mode === "chord" ? opts.strict : undefined,
        displayMidi: [...notes].sort((a, b) => a - b),
      } satisfies VoicingTarget;
    }),
  );
}

export interface VoicingDrillStepResult {
  target: VoicingTarget;
  event: ScoringEvent;
  xp: number;
  correct: boolean;
  score: number;
}

export interface VoicingDrillState {
  status: "idle" | "active" | "summary";
  index: number;
  total: number;
  current?: VoicingTarget;
  results: VoicingDrillStepResult[];
  xp: number;
  accuracy: number;
}

export interface VoicingDrillDependencies {
  router: InputRouter;
  services: PipelineServices;
  instrument: InstrumentId;
  variant?: DrillVariant;
  startPosition?: RootlessPosition;
  /** Held-together (strict) chord grading; defaults to lenient. */
  strict?: boolean;
  sessionId?: string;
  now?: () => number;
  makeId?: () => string;
}

type StateListener = (state: VoicingDrillState) => void;

export class VoicingDrillSession {
  readonly #host: ExerciseRunHost;
  readonly #targets: VoicingTarget[];
  readonly #deps: VoicingDrillDependencies;
  readonly #sessionId: string;
  readonly #listeners = new Set<StateListener>();
  #index = 0;
  #status: VoicingDrillState["status"] = "idle";
  #results: VoicingDrillStepResult[] = [];
  #runSeq = 0;

  constructor(deps: VoicingDrillDependencies) {
    this.#deps = deps;
    this.#targets = buildVoicingDrillTargets(deps.instrument, {
      variant: deps.variant,
      startPosition: deps.startPosition,
      strict: deps.strict,
    });
    this.#sessionId = deps.sessionId ?? `voicing-drill-${this.#targets.length}`;
    this.#host = new ExerciseRunHost(deps.router, deps.services, {
      now: deps.now,
      makeId: deps.makeId,
    });
  }

  get state(): VoicingDrillState {
    const completed = this.#results.length;
    return {
      status: this.#status,
      index: this.#index,
      total: this.#targets.length,
      current: this.#status === "active" ? this.#targets[this.#index] : undefined,
      results: [...this.#results],
      xp: this.#results.reduce((total, result) => total + result.xp, 0),
      accuracy:
        completed === 0 ? 0 : this.#results.reduce((sum, r) => sum + r.score, 0) / completed,
    };
  }

  subscribe(listener: StateListener): () => void {
    this.#listeners.add(listener);
    listener(this.state);
    return () => this.#listeners.delete(listener);
  }

  /** Live 0-1 progress of the current chord (notes matched so far). */
  get liveProgress(): number {
    return this.#host.liveState?.progress ?? 0;
  }

  start(): void {
    if (this.#status !== "idle") throw new Error("Voicing drill has already started.");
    if (this.#targets.length === 0) throw new Error("Voicing drill has no targets.");
    this.#status = "active";
    this.#index = 0;
    this.#results = [];
    this.#beginCurrent();
    this.#emit();
  }

  /** Grade the current chord and advance. Returns the step result. */
  async submit(): Promise<VoicingDrillStepResult> {
    if (this.#status !== "active") throw new Error("Voicing drill is not active.");
    const target = this.#targets[this.#index]!;
    const outcome = await this.#host.finish({ reason: "completed" });
    const step: VoicingDrillStepResult = {
      target,
      event: outcome.event,
      xp: outcome.xp,
      correct: outcome.result.correct,
      score: outcome.result.score,
    };
    this.#results.push(step);

    if (this.#index < this.#targets.length - 1) {
      this.#index += 1;
      this.#beginCurrent();
    } else {
      this.#status = "summary";
    }
    this.#emit();
    return step;
  }

  dispose(): void {
    this.#host.dispose();
    this.#listeners.clear();
  }

  #beginCurrent(): void {
    const target = this.#targets[this.#index]!;
    this.#host.start({
      exercise: createVoicingDrillExercise(target),
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}.${this.#runSeq++}`,
      context: { instrument: this.#deps.instrument, targetSkillIds: [VOICING_DRILL_SKILL] },
    });
  }

  #emit(): void {
    const state = this.state;
    this.#listeners.forEach((listener) => listener(state));
  }
}
