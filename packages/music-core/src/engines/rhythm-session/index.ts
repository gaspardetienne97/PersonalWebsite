import {
  monotonicMs,
  type ExerciseLiveState,
  type ExerciseResult,
  type ScoringEvent,
} from "@repo/music-core/domain";
import { ExerciseRunHost, type PipelineServices } from "@repo/music-core/engines/exercise";
import type { InputRouter } from "@repo/music-core/engines/input-router";
import {
  createRhythmPatternExercise,
  RHYTHM_PATTERN_CATALOG,
  type RhythmPatternId,
  type RhythmPatternPrompt,
} from "@repo/music-core/exercises/rhythm-pattern";
import {
  createRhythmPulseExercise,
  type RhythmPulsePrompt,
} from "@repo/music-core/exercises/rhythm-pulse";

export interface RhythmSessionOptions {
  bpm: number;
  beats: number;
  startTimestampMs: number;
  pattern?: RhythmPatternId;
  mode?: RhythmDrillMode;
}

export type RhythmDrillMode = "pulse" | "read-and-tap";

export interface RhythmDrillConfig {
  bpm: number;
  beats: number;
  pattern: RhythmPatternId;
  mode: RhythmDrillMode;
}

export interface RhythmDrillConfigSource {
  bpm?: unknown;
  beats?: unknown;
  pattern?: unknown;
  mode?: unknown;
  get?: (key: "bpm" | "beats" | "pattern" | "mode") => string | null;
}

export const RHYTHM_DRILL_DEFAULT_CONFIG: RhythmDrillConfig = {
  bpm: 100,
  beats: 4,
  pattern: "quarter-pulse",
  mode: "pulse",
};

export const RHYTHM_DRILL_PATTERNS = RHYTHM_PATTERN_CATALOG.map((pattern) => ({
  value: pattern.id,
  label: pattern.label,
}));

const RHYTHM_BPM_MIN = 40;
const RHYTHM_BPM_MAX = 220;
const RHYTHM_BEATS_MIN = 2;
const RHYTHM_BEATS_MAX = 16;

export function normalizeRhythmDrillConfig(source: RhythmDrillConfigSource): RhythmDrillConfig {
  return {
    bpm: normalizeInteger(readConfigValue(source, "bpm"), {
      fallback: RHYTHM_DRILL_DEFAULT_CONFIG.bpm,
      min: RHYTHM_BPM_MIN,
      max: RHYTHM_BPM_MAX,
    }),
    beats: normalizeInteger(readConfigValue(source, "beats"), {
      fallback: RHYTHM_DRILL_DEFAULT_CONFIG.beats,
      min: RHYTHM_BEATS_MIN,
      max: RHYTHM_BEATS_MAX,
    }),
    pattern: normalizeRhythmPattern(readConfigValue(source, "pattern")),
    mode: normalizeRhythmMode(readConfigValue(source, "mode")),
  };
}

export interface RhythmSessionDependencies {
  router: InputRouter;
  services: PipelineServices;
  sessionId?: string;
  now?: () => number;
  makeId?: () => string;
}

export interface RhythmResultView {
  prompt: RhythmPrompt;
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
  currentPrompt?: RhythmPrompt;
  live?: ExerciseLiveState;
  results: RhythmResultView[];
  summary?: RhythmSummary;
  error?: string;
}

type StateListener = (state: RhythmSessionState) => void;
type RhythmPrompt = RhythmPulsePrompt | RhythmPatternPrompt;

export class RhythmSession {
  #host: ExerciseRunHost;
  #unsubscribeRouter: () => void;
  #listeners = new Set<StateListener>();
  #status: RhythmSessionState["status"] = "ready";
  #currentPrompt?: RhythmPrompt;
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

  async start(options: RhythmSessionOptions): Promise<RhythmPrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A rhythm session is already active");

    const pattern = options.pattern ?? "quarter-pulse";
    const mode = options.mode ?? "pulse";
    const exercise =
      pattern === "quarter-pulse" && mode === "pulse"
        ? createRhythmPulseExercise({
            bpm: options.bpm,
            beats: options.beats,
            startTimestampMs: monotonicMs(options.startTimestampMs),
          })
        : createRhythmPatternExercise({
            patternId: pattern,
            bpm: options.bpm,
            bars: Math.max(1, Math.ceil(options.beats / 4)),
            startTimestampMs: monotonicMs(options.startTimestampMs),
          });
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-${mode}-${pattern}`,
      inputs: ["midi", "onscreen", "audio"],
      context: {
        targetSkillIds: exercise.skillIds,
        difficulty: 0.4,
      },
    });

    this.#status = "active";
    this.#currentPrompt = prompt.payload as RhythmPrompt;
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

function readConfigValue(
  source: RhythmDrillConfigSource,
  key: "bpm" | "beats" | "pattern" | "mode",
): unknown {
  if (source.get) return source.get(key);
  return source[key];
}

function normalizeRhythmMode(value: unknown): RhythmDrillMode {
  return value === "read-and-tap" ? "read-and-tap" : RHYTHM_DRILL_DEFAULT_CONFIG.mode;
}

function normalizeRhythmPattern(value: unknown): RhythmPatternId {
  return RHYTHM_PATTERN_CATALOG.some((pattern) => pattern.id === value)
    ? (value as RhythmPatternId)
    : RHYTHM_DRILL_DEFAULT_CONFIG.pattern;
}

function normalizeInteger(
  value: unknown,
  bounds: { fallback: number; min: number; max: number },
): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return bounds.fallback;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(parsed)));
}
