import {
  monotonicMs,
  type ExerciseLiveState,
  type ExerciseResult,
  type ScoringEvent,
} from "@repo/music-core/domain";
import { ExerciseRunHost, type PipelineServices } from "@repo/music-core/engines/exercise";
import type { InputRouter } from "@repo/music-core/engines/input-router";
import {
  createRhythmPulseExercise,
  type RhythmPulsePrompt,
} from "@repo/music-core/exercises/rhythm-pulse";

export interface RhythmSessionOptions {
  bpm: number;
  beats: number;
  startTimestampMs: number;
}

export interface RhythmSessionDependencies {
  router: InputRouter;
  services: PipelineServices;
  sessionId?: string;
  now?: () => number;
  makeId?: () => string;
}

export interface RhythmResultView {
  prompt: RhythmPulsePrompt;
  result: ExerciseResult;
  event: ScoringEvent;
  xp: number;
}

export interface RhythmSummary {
  total: number;
  correct: number;
  accuracy: number;
  xp: number;
  meanSignedErrorMs: number;
  meanAbsoluteErrorMs: number;
  results: RhythmResultView[];
}

export interface RhythmSessionState {
  status: "ready" | "active" | "summary" | "abandoned";
  currentPrompt?: RhythmPulsePrompt;
  live?: ExerciseLiveState;
  results: RhythmResultView[];
  summary?: RhythmSummary;
  error?: string;
}

type StateListener = (state: RhythmSessionState) => void;

export class RhythmSession {
  #host: ExerciseRunHost;
  #unsubscribeRouter: () => void;
  #listeners = new Set<StateListener>();
  #status: RhythmSessionState["status"] = "ready";
  #currentPrompt?: RhythmPulsePrompt;
  #results: RhythmResultView[] = [];
  #summary?: RhythmSummary;
  #error?: string;
  #completion?: Promise<void>;
  #finishing = false;
  #disposed = false;
  #sessionId: string;

  constructor(private readonly dependencies: RhythmSessionDependencies) {
    this.#sessionId = dependencies.sessionId ?? `rhythm-${Date.now()}`;
    this.#host = new ExerciseRunHost(dependencies.router, dependencies.services, {
      ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
      ...(dependencies.makeId === undefined ? {} : { makeId: dependencies.makeId }),
    });
    this.#unsubscribeRouter = dependencies.router.subscribe(() => this.#handleInput());
  }

  get state(): RhythmSessionState {
    return {
      status: this.#status,
      ...(this.#currentPrompt === undefined ? {} : { currentPrompt: this.#currentPrompt }),
      ...(this.#host.liveState === undefined ? {} : { live: this.#host.liveState }),
      results: [...this.#results],
      ...(this.#summary === undefined ? {} : { summary: this.#summary }),
      ...(this.#error === undefined ? {} : { error: this.#error }),
    };
  }

  subscribe(listener: StateListener): () => void {
    this.#listeners.add(listener);
    listener(this.state);
    return () => this.#listeners.delete(listener);
  }

  async start(options: RhythmSessionOptions): Promise<RhythmPulsePrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A rhythm session is already active");

    const exercise = createRhythmPulseExercise({
      bpm: options.bpm,
      beats: options.beats,
      startTimestampMs: monotonicMs(options.startTimestampMs),
    });
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-pulse`,
      inputs: ["midi", "onscreen", "audio"],
      context: {
        targetSkillIds: ["rhythm.quarter-pulse"],
        difficulty: 0.4,
      },
    });

    this.#status = "active";
    this.#currentPrompt = prompt.payload as RhythmPulsePrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return this.#currentPrompt;
  }

  async retrySave(): Promise<void> {
    this.#assertUsable();
    if (!this.#currentPrompt || this.#error === undefined) {
      throw new Error("No completed rhythm run is waiting to be saved");
    }
    this.#completion = this.#finishCurrent();
    await this.#completion;
  }

  abandon(): void {
    if (this.#disposed || this.#status === "summary") return;
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
      this.#results.push({
        prompt,
        result: outcome.result,
        event: outcome.event,
        xp: outcome.xp,
      });
      this.#status = "summary";
      this.#currentPrompt = undefined;
      this.#summary = summarize(this.#results);
      this.#notify();
    } catch (error) {
      this.#error =
        error instanceof Error ? error.message : "The rhythm result could not be saved.";
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
    if (this.#disposed) throw new Error("Rhythm session is disposed");
  }
}

function summarize(results: RhythmResultView[]): RhythmSummary {
  const timingErrors = results.flatMap(({ result }) =>
    result.metrics.filter((metric) => metric.kind === "timing").map((metric) => metric.errorMs),
  );
  const meanSignedErrorMs =
    timingErrors.length === 0
      ? 0
      : timingErrors.reduce((sum, error) => sum + error, 0) / timingErrors.length;
  const meanAbsoluteErrorMs =
    timingErrors.length === 0
      ? 0
      : timingErrors.reduce((sum, error) => sum + Math.abs(error), 0) / timingErrors.length;

  return {
    total: results.length,
    correct: results.filter(({ result }) => result.correct).length,
    accuracy:
      results.length === 0
        ? 0
        : results.filter(({ result }) => result.correct).length / results.length,
    xp: results.reduce((total, result) => total + result.xp, 0),
    meanSignedErrorMs,
    meanAbsoluteErrorMs,
    results: [...results],
  };
}
