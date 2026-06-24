import {
  type ExerciseLiveState,
  type ExerciseResult,
  type ScoringEvent,
} from "@repo/music-core/domain";
import { ExerciseRunHost, type PipelineServices } from "@repo/music-core/engines/exercise";
import type { InputRouter } from "@repo/music-core/engines/input-router";
import {
  createAerophoneLongToneExercise,
  type AerophoneLongTonePrompt,
} from "@repo/music-core/exercises/aerophone-long-tone";
import {
  createAerophoneSwellExercise,
  type AerophoneSwellPrompt,
} from "@repo/music-core/exercises/aerophone-swell";
import {
  createMpcSingleStrokeExercise,
  type MpcHitCount,
  type MpcSingleStrokePrompt,
} from "@repo/music-core/exercises/mpc-single-stroke";
import {
  createScalePatternExercise,
  type ScalePatternKind,
  type ScalePatternPrompt,
} from "@repo/music-core/exercises/scale-pattern";
import {
  createStringSpiderExercise,
  type StringSpiderPrompt,
} from "@repo/music-core/exercises/string-spider";
import {
  createTwoHandIndependenceExercise,
  type TwoHandIndependencePrompt,
} from "@repo/music-core/exercises/two-hand-independence";
import type { TuningProfile } from "@repo/music-core/engines/tunings";

export interface TechniqueScaleOptions {
  tonic: string;
  scale: ScalePatternKind;
  bpm: number;
}

export interface TechniqueLongToneOptions {
  targetMidi: number;
  holdMs: number;
  breathController?: number;
}

export interface TechniqueSwellOptions {
  targetMidi: number;
  durationMs: number;
  breathController?: number;
}

export interface TechniqueMpcRudimentOptions {
  leftPadMidi: number;
  rightPadMidi: number;
  hitCount: MpcHitCount;
  bpm: number;
}

export interface TechniqueSpiderOptions {
  tuning: TuningProfile;
  stringNumber: number;
  startFret: number;
  bpm: number;
}

export interface TechniqueTwoHandOptions {
  tonic: string;
  bpm: number;
  bars?: number;
}

export type TechniquePrompt =
  | ScalePatternPrompt
  | AerophoneLongTonePrompt
  | AerophoneSwellPrompt
  | MpcSingleStrokePrompt
  | StringSpiderPrompt
  | TwoHandIndependencePrompt;

export interface TechniqueSessionDependencies {
  router: InputRouter;
  services: PipelineServices;
  sessionId?: string;
  initialUnlockedBpm?: number;
  tempoStepBpm?: number;
  maxBpm?: number;
  now?: () => number;
  makeId?: () => string;
}

export interface TechniqueResultView {
  prompt: TechniquePrompt;
  result: ExerciseResult;
  event: ScoringEvent;
  xp: number;
}

export interface TechniqueSummary {
  total: number;
  correct: number;
  accuracy: number;
  xp: number;
  noteAccuracy: number;
  meanEvennessErrorMs: number;
  velocityConsistency: number;
  breathSteadiness: number;
  highestUnlockedBpm: number;
  nextTargetBpm: number;
  results: TechniqueResultView[];
}

export interface TechniqueSessionState {
  status: "ready" | "active" | "summary" | "abandoned";
  currentPrompt?: TechniquePrompt;
  live?: ExerciseLiveState;
  highestUnlockedBpm: number;
  nextTargetBpm: number;
  results: TechniqueResultView[];
  summary?: TechniqueSummary;
  error?: string;
}

type StateListener = (state: TechniqueSessionState) => void;

export class TechniqueSession {
  #host: ExerciseRunHost;
  #unsubscribeRouter: () => void;
  #listeners = new Set<StateListener>();
  #status: TechniqueSessionState["status"] = "ready";
  #currentPrompt?: TechniquePrompt;
  #results: TechniqueResultView[] = [];
  #summary?: TechniqueSummary;
  #error?: string;
  #completion?: Promise<void>;
  #finishing = false;
  #disposed = false;
  #sessionId: string;
  #highestUnlockedBpm: number;

  constructor(private readonly dependencies: TechniqueSessionDependencies) {
    this.#sessionId = dependencies.sessionId ?? `technique-${Date.now()}`;
    this.#highestUnlockedBpm = dependencies.initialUnlockedBpm ?? 100;
    this.#host = new ExerciseRunHost(dependencies.router, dependencies.services, {
      ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
      ...(dependencies.makeId === undefined ? {} : { makeId: dependencies.makeId }),
    });
    this.#unsubscribeRouter = dependencies.router.subscribe(() => this.#handleInput());
  }

  get state(): TechniqueSessionState {
    return {
      status: this.#status,
      ...(this.#currentPrompt === undefined ? {} : { currentPrompt: this.#currentPrompt }),
      ...(this.#host.liveState === undefined ? {} : { live: this.#host.liveState }),
      highestUnlockedBpm: this.#highestUnlockedBpm,
      nextTargetBpm: this.nextTargetBpm,
      results: [...this.#results],
      ...(this.#summary === undefined ? {} : { summary: this.#summary }),
      ...(this.#error === undefined ? {} : { error: this.#error }),
    };
  }

  get nextTargetBpm(): number {
    return this.#highestUnlockedBpm;
  }

  subscribe(listener: StateListener): () => void {
    this.#listeners.add(listener);
    listener(this.state);
    return () => this.#listeners.delete(listener);
  }

  async startScale(options: TechniqueScaleOptions): Promise<ScalePatternPrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");
    if (options.bpm > this.#highestUnlockedBpm) {
      throw new Error(
        `Clean a scale at ${this.#highestUnlockedBpm} BPM before ${options.bpm} BPM.`,
      );
    }

    const exercise = createScalePatternExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-scale-${options.bpm}`,
      inputs: ["midi", "onscreen"],
      context: {
        targetSkillIds: [`technique.scale.${options.scale}`],
        difficulty: difficultyForBpm(options.bpm),
      },
    });

    this.#status = "active";
    this.#currentPrompt = prompt.payload as ScalePatternPrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return this.#currentPrompt;
  }

  async startLongTone(options: TechniqueLongToneOptions): Promise<AerophoneLongTonePrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createAerophoneLongToneExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-long-tone-${options.targetMidi}`,
      inputs: ["midi"],
      context: {
        targetSkillIds: ["technique.aerophone.breath-steadiness"],
        difficulty: difficultyForHold(options.holdMs),
        instrument: "aerophone",
      },
    });

    this.#status = "active";
    this.#currentPrompt = prompt.payload as AerophoneLongTonePrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return this.#currentPrompt;
  }

  async startSwell(options: TechniqueSwellOptions): Promise<AerophoneSwellPrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createAerophoneSwellExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-swell-${options.targetMidi}`,
      inputs: ["midi"],
      context: {
        targetSkillIds: ["technique.aerophone.dynamic-control"],
        difficulty: difficultyForHold(options.durationMs),
        instrument: "aerophone",
      },
    });

    this.#status = "active";
    this.#currentPrompt = prompt.payload as AerophoneSwellPrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return this.#currentPrompt;
  }

  async startMpcRudiment(options: TechniqueMpcRudimentOptions): Promise<MpcSingleStrokePrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createMpcSingleStrokeExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-mpc-single-strokes-${options.leftPadMidi}-${options.rightPadMidi}-${options.hitCount}-${options.bpm}`,
      inputs: ["midi", "onscreen"],
      context: {
        targetSkillIds: ["technique.mpc", "technique.mpc.single-strokes"],
        difficulty: difficultyForBpm(options.bpm),
        instrument: "mpc",
      },
    });

    this.#status = "active";
    this.#currentPrompt = prompt.payload as MpcSingleStrokePrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return this.#currentPrompt;
  }

  async startSpider(options: TechniqueSpiderOptions): Promise<StringSpiderPrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createStringSpiderExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-spider-${options.tuning.id}-${options.stringNumber}-${options.startFret}-${options.bpm}`,
      inputs: ["midi", "onscreen"],
      context: {
        targetSkillIds: exercise.skillIds,
        difficulty: difficultyForBpm(options.bpm),
        instrument: options.tuning.instrument,
      },
    });

    const currentPrompt = prompt.payload as StringSpiderPrompt;
    this.#status = "active";
    this.#currentPrompt = currentPrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return currentPrompt;
  }

  async startTwoHand(options: TechniqueTwoHandOptions): Promise<TwoHandIndependencePrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createTwoHandIndependenceExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-two-hand-${options.tonic}-${options.bpm}-${options.bars ?? 2}`,
      inputs: ["midi", "onscreen"],
      context: {
        targetSkillIds: exercise.skillIds,
        difficulty: difficultyForBpm(options.bpm),
        instrument: "piano",
      },
    });

    const currentPrompt = prompt.payload as TwoHandIndependencePrompt;
    this.#status = "active";
    this.#currentPrompt = currentPrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return currentPrompt;
  }

  async retrySave(): Promise<void> {
    this.#assertUsable();
    if (!this.#currentPrompt || this.#error === undefined) {
      throw new Error("No completed technique run is waiting to be saved");
    }
    this.#completion = this.#finishCurrent();
    await this.#completion;
  }

  abandon(): void {
    if (this.#disposed || this.#status === "summary") return;
    this.#host.cancel();
    this.#status = "abandoned";
    this.#currentPrompt = undefined;
    this.#notify();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#host.dispose();
    this.#unsubscribeRouter();
    this.#listeners.clear();
  }

  #handleInput(): void {
    this.#notify();
    if (this.#status !== "active" || this.#finishing || (this.#host.liveState?.progress ?? 0) < 1) {
      return;
    }

    this.#completion = this.#finishCurrent();
    void this.#completion.catch(() => undefined);
  }

  async #finishCurrent(): Promise<void> {
    const prompt = this.#currentPrompt;
    if (!prompt) return;

    this.#finishing = true;
    this.#error = undefined;
    try {
      const outcome = await this.#host.finish();
      const resultView = {
        prompt,
        result: outcome.result,
        event: outcome.event,
        xp: outcome.xp,
      };
      this.#results.push(resultView);
      if (
        isScalePatternPrompt(prompt) &&
        outcome.result.correct &&
        prompt.bpm >= this.#highestUnlockedBpm
      ) {
        this.#highestUnlockedBpm = Math.min(
          this.dependencies.maxBpm ?? 180,
          this.#highestUnlockedBpm + (this.dependencies.tempoStepBpm ?? 10),
        );
      }
      this.#status = "summary";
      this.#currentPrompt = undefined;
      this.#summary = summarize(this.#results, this.#highestUnlockedBpm);
      this.#notify();
    } catch (error) {
      this.#error =
        error instanceof Error ? error.message : "The technique result could not be saved.";
      this.#notify();
      throw error;
    } finally {
      this.#finishing = false;
      this.#completion = undefined;
    }
  }

  #notify(): void {
    const state = this.state;
    this.#listeners.forEach((listener) => listener(state));
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Technique session is disposed");
  }
}

function summarize(results: TechniqueResultView[], highestUnlockedBpm: number): TechniqueSummary {
  const pitchMetrics = results.flatMap(({ result }) =>
    result.metrics.filter((metric) => metric.kind === "pitch"),
  );
  const correctPitches = pitchMetrics.filter(
    (metric) => metric.actualMidi === metric.expectedMidi,
  ).length;
  const timingErrors = results.flatMap(({ result }) =>
    result.metrics.filter((metric) => metric.kind === "timing").map((metric) => metric.errorMs),
  );
  const breathMetrics = results.flatMap(({ result }) =>
    result.metrics.filter((metric) => metric.kind === "breath"),
  );
  const velocities = results.flatMap(({ result }) =>
    result.metrics.filter((metric) => metric.kind === "velocity").map((metric) => metric.actual),
  );

  return {
    total: results.length,
    correct: results.filter(({ result }) => result.correct).length,
    accuracy:
      results.length === 0
        ? 0
        : results.filter(({ result }) => result.correct).length / results.length,
    xp: results.reduce((total, result) => total + result.xp, 0),
    noteAccuracy: pitchMetrics.length === 0 ? 0 : correctPitches / pitchMetrics.length,
    meanEvennessErrorMs:
      timingErrors.length === 0
        ? 0
        : timingErrors.reduce((sum, error) => sum + Math.abs(error), 0) / timingErrors.length,
    velocityConsistency: consistency(velocities),
    breathSteadiness:
      breathMetrics.length === 0
        ? 0
        : breathMetrics.reduce((sum, metric) => sum + metric.steadiness, 0) / breathMetrics.length,
    highestUnlockedBpm,
    nextTargetBpm: highestUnlockedBpm,
    results: [...results],
  };
}

function isScalePatternPrompt(prompt: TechniquePrompt): prompt is ScalePatternPrompt {
  return (
    "noteLabels" in prompt &&
    Array.isArray(prompt.noteLabels) &&
    "midiNotes" in prompt &&
    Array.isArray(prompt.midiNotes) &&
    "targetSpacingMs" in prompt &&
    typeof prompt.targetSpacingMs === "number" &&
    !("targetSequence" in prompt)
  );
}

function consistency(values: number[]): number {
  if (values.length === 0) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  if (variance <= Number.EPSILON) return 1;
  return Math.max(0, Math.min(1, 1 - Math.sqrt(variance) / Math.max(average, 0.01)));
}

function difficultyForBpm(bpm: number): number {
  return Math.max(0.2, Math.min(0.9, (bpm - 60) / 160));
}

function difficultyForHold(holdMs: number): number {
  return Math.max(0.2, Math.min(0.9, holdMs / 10_000));
}
