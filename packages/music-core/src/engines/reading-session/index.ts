import {
  monotonicMs,
  type ExerciseDefinition,
  type ExerciseLiveState,
  type ExercisePrompt,
  type ExerciseResult,
  type ScoringEvent,
} from "@repo/music-core/domain";
import {
  ExerciseRegistry,
  ExerciseRunHost,
  ExerciseScheduler,
  type PipelineServices,
  type ScheduledExercise,
} from "@repo/music-core/engines/exercise";
import type { InputRouter } from "@repo/music-core/engines/input-router";
import {
  createNoteReadingExercise,
  noteReadingChoiceEvent,
  type NoteReadingOptions,
  type NoteReadingPrompt,
  type ReadingAnswerMode,
} from "@repo/music-core/exercises/note-reading";
import {
  createSightReadingExercise,
  type SightReadingOptions,
  type SightReadingPrompt,
} from "@repo/music-core/exercises/sight-reading";
import type {
  ScoreFollowerAnswer,
  ScoreFollowerLiveState,
} from "@repo/music-core/engines/score-follower";

export interface FlashcardSessionOptions extends NoteReadingOptions {
  answerMode: ReadingAnswerMode;
  length?: number;
}

export interface ReadingSessionDependencies {
  router: InputRouter;
  services: PipelineServices;
  sessionId?: string;
  random?: () => number;
  now?: () => number;
  makeId?: () => string;
}

export interface ReadingQueueItem {
  targetSkillId: string;
  difficulty: number;
  reason: ScheduledExercise["reason"];
}

export interface ReadingResultView {
  targetSkillId: string;
  prompt: NoteReadingPrompt | SightReadingPrompt;
  result: ExerciseResult;
  event: ScoringEvent;
  xp: number;
}

export interface ReadingSummary {
  total: number;
  correct: number;
  accuracy: number;
  xp: number;
  results: ReadingResultView[];
}

export interface ReadingSessionState {
  status: "ready" | "flashcard" | "sight-reading" | "summary" | "abandoned";
  currentPrompt?: NoteReadingPrompt | SightReadingPrompt;
  currentIndex: number;
  total: number;
  live?: ExerciseLiveState | ScoreFollowerLiveState;
  countIn?: "ready" | "playing" | "done";
  results: ReadingResultView[];
  summary?: ReadingSummary;
  error?: string;
}

type StateListener = (state: ReadingSessionState) => void;

export class ReadingSession {
  #host: ExerciseRunHost;
  #unsubscribeRouter: () => void;
  #listeners = new Set<StateListener>();
  #status: ReadingSessionState["status"] = "ready";
  #countIn?: ReadingSessionState["countIn"];
  #queue: ReadingQueueItem[] = [];
  #currentIndex = 0;
  #currentPrompt?: NoteReadingPrompt | SightReadingPrompt;
  #results: ReadingResultView[] = [];
  #summary?: ReadingSummary;
  #error?: string;
  #answerMode?: ReadingAnswerMode;
  #exercise?: ExerciseDefinition<NoteReadingPrompt | SightReadingPrompt, unknown>;
  #sightReadingOptions?: SightReadingOptions;
  #completion?: Promise<void>;
  #finishing = false;
  #disposed = false;
  #sessionId: string;

  constructor(private readonly dependencies: ReadingSessionDependencies) {
    this.#sessionId = dependencies.sessionId ?? `reading-${Date.now()}`;
    this.#host = new ExerciseRunHost(dependencies.router, dependencies.services, {
      ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
      ...(dependencies.makeId === undefined ? {} : { makeId: dependencies.makeId }),
    });
    this.#unsubscribeRouter = dependencies.router.subscribe(() => this.#handleInput());
  }

  get queue(): ReadingQueueItem[] {
    return this.#queue.map((item) => ({ ...item }));
  }

  get state(): ReadingSessionState {
    return {
      status: this.#status,
      ...(this.#currentPrompt === undefined ? {} : { currentPrompt: this.#currentPrompt }),
      currentIndex: this.#currentIndex,
      total: this.#queue.length,
      ...(this.#host.liveState === undefined ? {} : { live: this.#host.liveState }),
      ...(this.#countIn === undefined ? {} : { countIn: this.#countIn }),
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

  async startFlashcards(options: FlashcardSessionOptions): Promise<void> {
    this.#assertUsable();
    if (this.#status === "flashcard" || this.#status === "sight-reading") {
      throw new Error("A reading session is already active");
    }

    this.#exercise = createNoteReadingExercise({
      random: this.dependencies.random,
      options,
    });
    const registry = new ExerciseRegistry();
    registry.register(this.#exercise);
    const scheduler = new ExerciseScheduler(
      registry,
      this.dependencies.services.skills,
      this.dependencies.services.analytics,
    );
    this.#queue = scheduler
      .buildQueue({ length: options.length ?? 10 })
      .map(({ targetSkillIds, difficulty, reason }) => ({
        targetSkillId: targetSkillIds[0]!,
        difficulty,
        reason,
      }));
    if (this.#queue.length === 0) throw new Error("No reading prompts are available");

    this.#status = "flashcard";
    this.#countIn = undefined;
    this.#answerMode = options.answerMode;
    this.#sightReadingOptions = undefined;
    this.#currentIndex = 0;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#startCurrent();
  }

  async answerChoice(token: string): Promise<void> {
    this.#assertUsable();
    if (this.#status !== "flashcard" || !isNoteReadingPrompt(this.#currentPrompt)) {
      throw new Error("No active reading flashcard");
    }
    if (this.#answerMode !== "choice") throw new Error("This session accepts played answers");

    this.dependencies.router.push(noteReadingChoiceEvent(token, this.#currentPrompt.choices));
    if (this.#completion) await this.#completion;
  }

  async retrySave(): Promise<void> {
    this.#assertUsable();
    if (!this.#currentPrompt || this.#error === undefined) {
      throw new Error("No completed reading answer is waiting to be saved");
    }
    this.#completion = this.#finishCurrent();
    await this.#completion;
  }

  async prepareSightReading(options: SightReadingOptions): Promise<void> {
    this.#assertUsable();
    if (this.#status === "flashcard" || this.#status === "sight-reading") {
      throw new Error("A reading session is already active");
    }

    const exercise = createSightReadingExercise({
      random: this.dependencies.random,
      options,
    });
    const targetSkillId = exercise.skillIds[0];
    if (!targetSkillId) throw new Error("No sight-reading skills are available");

    const prompt = exercise.generate({
      targetSkillIds: [targetSkillId],
      difficulty: options.difficulty,
      instrument: options.instrument,
    });

    this.#exercise = exercise;
    this.#sightReadingOptions = options;
    this.#queue = [{ targetSkillId, difficulty: options.difficulty, reason: "new" }];
    this.#status = "sight-reading";
    this.#countIn = "ready";
    this.#answerMode = undefined;
    this.#currentIndex = 0;
    this.#currentPrompt = prompt.payload;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
  }

  async startSightReading(startTimestampMs: number): Promise<void> {
    this.#assertUsable();
    const prompt = this.#currentPrompt;
    const options = this.#sightReadingOptions;
    const item = this.#queue[0];
    if (this.#status !== "sight-reading" || !isSightReadingPrompt(prompt) || !options || !item) {
      throw new Error("No prepared sight-reading session");
    }
    if (this.#countIn !== "ready") throw new Error("Sight-reading already started");

    const startedPrompt: SightReadingPrompt = {
      ...prompt,
      options: {
        ...prompt.options,
        startTimestampMs: monotonicMs(startTimestampMs),
      },
    };
    const exercise = fixedSightReadingExercise(
      startedPrompt,
      createSightReadingExercise({
        random: this.dependencies.random,
        options: {
          ...options,
          startTimestampMs: monotonicMs(startTimestampMs),
        },
      }),
    );
    this.#exercise = exercise;
    this.#currentPrompt = startedPrompt;
    this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-sight-reading`,
      inputs: ["midi", "onscreen"],
      context: {
        targetSkillIds: [item.targetSkillId],
        difficulty: item.difficulty,
        instrument: options.instrument,
      },
    });
    this.#countIn = "playing";
    this.#notify();
  }

  async finishSightReading(): Promise<void> {
    this.#assertUsable();
    if (this.#status !== "sight-reading" || !isSightReadingPrompt(this.#currentPrompt)) {
      throw new Error("No active sight-reading session");
    }

    this.#completion = this.#finishCurrent();
    await this.#completion;
  }

  abandon(): void {
    if (this.#disposed || this.#status === "summary") return;
    this.#status = "abandoned";
    this.#currentPrompt = undefined;
    this.#countIn = undefined;
    this.#notify();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#host.dispose();
    this.#unsubscribeRouter();
    this.#listeners.clear();
  }

  #startCurrent(): void {
    const item = this.#queue[this.#currentIndex];
    if (!item || !this.#exercise || !this.#answerMode) {
      throw new Error("No reading prompt remains");
    }
    const prompt = this.#host.start({
      exercise: this.#exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-${this.#currentIndex + 1}`,
      inputs: this.#answerMode === "choice" ? ["click"] : ["midi", "onscreen"],
      context: {
        targetSkillIds: [item.targetSkillId],
        difficulty: item.difficulty,
      },
    });
    this.#currentPrompt = prompt.payload as NoteReadingPrompt;
    this.#notify();
  }

  #handleInput(): void {
    if (
      this.#status !== "flashcard" ||
      this.#finishing ||
      this.#currentPrompt === undefined ||
      (this.#host.liveState?.progress ?? 0) < 1
    ) {
      return;
    }

    this.#completion = this.#finishCurrent();
    void this.#completion.catch(() => undefined);
  }

  async #finishCurrent(): Promise<void> {
    const item = this.#queue[this.#currentIndex];
    const prompt = this.#currentPrompt;
    if (!item || !prompt) return;

    this.#finishing = true;
    this.#error = undefined;
    try {
      const outcome = await this.#host.finish();
      this.#results.push({
        targetSkillId: item.targetSkillId,
        prompt,
        ...outcome,
      });
      this.#currentIndex += 1;
      if (this.#currentIndex >= this.#queue.length) {
        this.#status = "summary";
        this.#currentPrompt = undefined;
        this.#countIn = undefined;
        this.#summary = summarize(this.#results);
      } else {
        this.#startCurrent();
      }
      this.#notify();
    } catch (error) {
      this.#error =
        error instanceof Error ? error.message : "The reading result could not be saved.";
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
    if (this.#disposed) throw new Error("Reading session is disposed");
  }
}

function fixedSightReadingExercise(
  prompt: SightReadingPrompt,
  exercise: ReturnType<typeof createSightReadingExercise>,
): ExerciseDefinition<SightReadingPrompt, ScoreFollowerAnswer> {
  const fixedPrompt: ExercisePrompt<SightReadingPrompt> = {
    id: `sight-reading:${prompt.score.id}`,
    payload: prompt,
    scoreId: prompt.score.id,
  };

  return {
    ...exercise,
    generate: () => fixedPrompt,
  };
}

function isSightReadingPrompt(
  prompt: NoteReadingPrompt | SightReadingPrompt | undefined,
): prompt is SightReadingPrompt {
  return prompt !== undefined && "groups" in prompt && "notation" in prompt;
}

function isNoteReadingPrompt(
  prompt: NoteReadingPrompt | SightReadingPrompt | undefined,
): prompt is NoteReadingPrompt {
  return prompt !== undefined && "choices" in prompt && "writtenPitches" in prompt;
}

function summarize(results: ReadingResultView[]): ReadingSummary {
  const correct = results.filter(({ result }) => result.correct).length;
  return {
    total: results.length,
    correct,
    accuracy: results.length === 0 ? 0 : correct / results.length,
    xp: results.reduce((total, result) => total + result.xp, 0),
    results: [...results],
  };
}
