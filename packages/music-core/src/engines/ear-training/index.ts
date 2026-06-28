import type {
  ExercisePrompt,
  ExerciseResult,
  FeedbackItem,
  InputSource,
  ScoringEvent,
} from "@repo/music-core/domain";
import {
  ExerciseRunHost,
  type ExerciseRegistry,
  type ExerciseScheduler,
  type PipelineServices,
  type ScheduledExercise,
} from "@repo/music-core/engines/exercise";
import type { InputRouter } from "@repo/music-core/engines/input-router";
import {
  choiceAnswerEvent,
  type EarTrainingAnswerMode,
  type EarTrainingDrill,
  type EarTrainingFeedbackMode,
  type EarTrainingPromptBase,
} from "@repo/music-core/exercises/ear-training";
import {
  degreeTokensForScaleDegreeSet,
  type ScaleDegreeSetId,
} from "@repo/music-core/exercises/scale-degree-recognition";

export {
  builtEarTrainingCapabilities,
  currentEarTrainingLearningPath,
  EAR_TRAINING_CAPABILITIES,
  EAR_TRAINING_LEARNING_PATH,
  type EarTrainingCapability,
  type EarTrainingCapabilityStatus,
  type EarTrainingLearningPathStage,
} from "./curriculum";
export {
  buildRepertoireEarTransfers,
  buildRepertoireReviewPlan,
  buildRepertoireReviewPlanSchedule,
  buildRepertoireReviewQueue,
  createRepertoireTransferExercise,
  type RepertoireEarTransfer,
  type RepertoireEarTransferOptions,
  type RepertoireReviewPlan,
  type RepertoireReviewPlanOptions,
  type RepertoireReviewPlanSection,
  type RepertoireReviewPlanSectionId,
  type RepertoireReviewItem,
  type RepertoireReviewQueueOptions,
  type RepertoireReviewStatus,
  type RepertoireTransferPrompt,
} from "./repertoire";

export interface EarTrainingSessionOptions {
  drill: EarTrainingDrill | "mixed";
  answerMode: EarTrainingAnswerMode;
  feedbackMode: EarTrainingFeedbackMode;
  length?: number;
  queueMode?: "adaptive" | "balanced";
  scaleDegreeSet?: ScaleDegreeSetId;
}

export interface EarTrainingSessionDependencies {
  router: InputRouter;
  registry: ExerciseRegistry;
  scheduler: ExerciseScheduler;
  services: PipelineServices;
  sessionId?: string;
  now?: () => number;
  makeId?: () => string;
}

export interface EarTrainingQueueItem {
  drill: EarTrainingDrill;
  exerciseId: string;
  targetSkillId: string;
  difficulty: number;
  reason: ScheduledExercise["reason"];
}

export interface EarTrainingResultView {
  drill: EarTrainingDrill;
  targetSkillId: string;
  prompt: EarTrainingPromptBase;
  result: ExerciseResult;
  event: ScoringEvent;
  xp: number;
}

export interface EarTrainingDrillSummary {
  total: number;
  correct: number;
  accuracy: number;
}

export interface EarTrainingConfusion {
  drill: EarTrainingDrill;
  expected: string;
  actual: string;
  count: number;
}

export interface EarTrainingSummary {
  total: number;
  correct: number;
  accuracy: number;
  xp: number;
  streakDays: number;
  byDrill: Partial<Record<EarTrainingDrill, EarTrainingDrillSummary>>;
  recentResults: EarTrainingResultView[];
  confusions: EarTrainingConfusion[];
}

export interface EarTrainingSessionState {
  status: "ready" | "active" | "summary" | "abandoned";
  options: EarTrainingSessionOptions;
  queue: EarTrainingQueueItem[];
  currentIndex: number;
  currentPrompt?: EarTrainingPromptBase;
  heard: boolean;
  results: EarTrainingResultView[];
  feedback: FeedbackItem[];
  sessionXp: number;
  error?: string;
  summary?: EarTrainingSummary;
}

type StateListener = (state: EarTrainingSessionState) => void;

export class EarTrainingSession {
  #host: ExerciseRunHost;
  #unsubscribe: () => void;
  #queue: EarTrainingQueueItem[];
  #status: EarTrainingSessionState["status"] = "ready";
  #currentIndex = 0;
  #currentPrompt?: EarTrainingPromptBase;
  #heard = false;
  #results: EarTrainingResultView[] = [];
  #feedback: FeedbackItem[] = [];
  #error?: string;
  #summary?: EarTrainingSummary;
  #listeners = new Set<StateListener>();
  #completion?: Promise<void>;
  #finishing = false;
  #disposed = false;
  #sessionId: string;

  constructor(
    private readonly dependencies: EarTrainingSessionDependencies,
    private readonly options: EarTrainingSessionOptions,
  ) {
    this.#sessionId = dependencies.sessionId ?? `ear-training-${Date.now()}`;
    this.#queue = buildSessionQueue(dependencies.registry, dependencies.scheduler, options);
    this.#host = new ExerciseRunHost(dependencies.router, dependencies.services, {
      ...(dependencies.now !== undefined ? { now: dependencies.now } : {}),
      ...(dependencies.makeId !== undefined ? { makeId: dependencies.makeId } : {}),
    });
    this.#unsubscribe = dependencies.router.subscribe(() => this.#handleInput());
  }

  get queue(): EarTrainingQueueItem[] {
    return this.#queue.map((item) => ({ ...item }));
  }

  get state(): EarTrainingSessionState {
    return {
      status: this.#status,
      options: { ...this.options },
      queue: this.queue,
      currentIndex: this.#currentIndex,
      ...(this.#currentPrompt !== undefined ? { currentPrompt: this.#currentPrompt } : {}),
      heard: this.#heard,
      results: [...this.#results],
      feedback: [...this.#feedback],
      sessionXp: this.#results.reduce((total, result) => total + result.xp, 0),
      ...(this.#error !== undefined ? { error: this.#error } : {}),
      ...(this.#summary !== undefined ? { summary: this.#summary } : {}),
    };
  }

  subscribe(listener: StateListener): () => void {
    this.#listeners.add(listener);
    listener(this.state);
    return () => this.#listeners.delete(listener);
  }

  async start(): Promise<EarTrainingPromptBase> {
    this.#assertUsable();
    if (this.#status !== "ready") throw new Error("Ear-training session has already started");
    if (this.#queue.length === 0) throw new Error("No ear-training prompts are available");
    return this.#startCurrent();
  }

  replay(): EarTrainingPromptBase {
    this.#assertUsable();
    if (this.#status !== "active" || !this.#currentPrompt) {
      throw new Error("No active ear-training prompt");
    }
    this.#heard = true;
    this.#notify();
    return this.#currentPrompt;
  }

  async answerChoice(token: string): Promise<void> {
    this.#assertUsable();
    if (this.options.answerMode !== "choice") {
      throw new Error("This session accepts musical play-back answers");
    }
    if (!this.#heard || !this.#currentPrompt) {
      throw new Error("Replay the prompt before answering");
    }

    this.dependencies.router.push(
      choiceAnswerEvent(
        token,
        this.#currentPrompt.choices.map((choice) => choice.token),
      ),
    );
    const completion = this.#completion;
    if (completion) await completion;
  }

  async answerListening(heardCorrectly: boolean): Promise<void> {
    this.#assertUsable();
    if (this.options.answerMode !== "listen") {
      throw new Error("This session does not accept listening self-assessment");
    }
    if (!this.#heard || !this.#currentPrompt) {
      throw new Error("Replay the prompt before answering");
    }
    if (this.#currentPrompt.choices.length === 0) {
      throw new Error("This prompt cannot be self-assessed in listening mode");
    }

    const token = heardCorrectly
      ? this.#currentPrompt.answerToken
      : (this.#currentPrompt.choices.find(({ token }) => token !== this.#currentPrompt?.answerToken)
          ?.token ?? this.#currentPrompt.answerToken);

    this.dependencies.router.push(
      choiceAnswerEvent(
        token,
        this.#currentPrompt.choices.map((choice) => choice.token),
      ),
    );
    const completion = this.#completion;
    if (completion) await completion;
  }

  abandon(): void {
    if (this.#disposed || this.#status === "summary") return;
    this.#status = "abandoned";
    this.#currentPrompt = undefined;
    this.#heard = false;
    this.#notify();
    this.#disposeSubscriptions();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposeSubscriptions();
  }

  #startCurrent(): EarTrainingPromptBase {
    const item = this.#queue[this.#currentIndex];
    if (!item) throw new Error("No ear-training prompt remains");
    const exercise = this.dependencies.registry.get(item.exerciseId);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-${this.#currentIndex + 1}`,
      inputs: inputsForAnswerMode(this.options.answerMode, item.drill),
      context: {
        targetSkillIds: [item.targetSkillId],
        difficulty: item.difficulty,
        ...(this.options.scaleDegreeSet !== undefined
          ? { metadata: { scaleDegreeSet: this.options.scaleDegreeSet } }
          : {}),
      },
    }) as ExercisePrompt<EarTrainingPromptBase>;

    this.#status = "active";
    this.#currentPrompt = prompt.payload;
    this.#heard = false;
    this.#notify();
    return prompt.payload;
  }

  #handleInput(): void {
    if (
      !this.#heard ||
      this.#status !== "active" ||
      this.#finishing ||
      (this.#host.liveState?.progress ?? 0) < 1
    ) {
      return;
    }

    this.#completion = this.#finishCurrent();
    void this.#completion.catch((error) => {
      this.#error =
        error instanceof Error ? error.message : "The completed answer could not be saved.";
      this.#notify();
    });
  }

  async #finishCurrent(): Promise<void> {
    const prompt = this.#currentPrompt;
    const item = this.#queue[this.#currentIndex];
    if (!prompt || !item) return;

    this.#finishing = true;
    this.#error = undefined;
    try {
      const outcome = await this.#host.finish();
      this.#results.push({
        drill: item.drill,
        targetSkillId: item.targetSkillId,
        prompt,
        result: outcome.result,
        event: outcome.event,
        xp: outcome.xp,
      });
      this.#feedback = this.options.feedbackMode === "practice" ? [...outcome.result.feedback] : [];
      this.#currentIndex += 1;

      if (this.#currentIndex >= this.#queue.length) {
        this.#status = "summary";
        this.#currentPrompt = undefined;
        this.#heard = false;
        this.#summary = summarize(
          this.#results,
          this.dependencies.services.progress.state.streakDays,
        );
      } else {
        this.#startCurrent();
      }
      this.#notify();
    } finally {
      this.#finishing = false;
      this.#completion = undefined;
    }
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Ear-training session is disposed");
  }

  #disposeSubscriptions(): void {
    this.#unsubscribe();
    this.#host.dispose();
    this.#disposed = true;
  }

  #notify(): void {
    const state = this.state;
    for (const listener of this.#listeners) listener(state);
  }
}

function buildSessionQueue(
  registry: ExerciseRegistry,
  scheduler: ExerciseScheduler,
  options: EarTrainingSessionOptions,
): EarTrainingQueueItem[] {
  const length = Math.max(1, Math.floor(options.length ?? 10));
  const candidateCount = registry
    .list()
    .reduce((total, exercise) => total + exercise.skillIds.length, 0);
  const scaleDegreeTokens = new Set(degreeTokensForScaleDegreeSet(options.scaleDegreeSet));
  const scheduled = scheduler.buildQueue({ length: candidateCount });
  const byDrill = new Map<EarTrainingDrill, EarTrainingQueueItem[]>();

  for (const item of scheduled) {
    const drill = drillForExercise(item.exerciseId);
    const targetSkillId = item.targetSkillIds[0];
    if (!drill || !targetSkillId) continue;
    if (!drillEligibleForAnswerMode(drill, options.answerMode)) continue;
    if (drill === "scale-degree" && !scaleDegreeTokens.has(scaleDegreeToken(targetSkillId))) {
      continue;
    }
    const queue = byDrill.get(drill) ?? [];
    queue.push({
      drill,
      exerciseId: item.exerciseId,
      targetSkillId,
      difficulty: item.difficulty,
      reason: item.reason,
    });
    byDrill.set(drill, queue);
  }

  if (options.drill !== "mixed") return cycleToLength(byDrill.get(options.drill) ?? [], length);

  if (options.queueMode !== "balanced") {
    return adaptiveMixedQueue(
      scheduled
        .map((item) => {
          const drill = drillForExercise(item.exerciseId);
          const targetSkillId = item.targetSkillIds[0];
          if (!drill || !targetSkillId) return undefined;
          if (!drillEligibleForAnswerMode(drill, options.answerMode)) return undefined;
          if (drill === "scale-degree" && !scaleDegreeTokens.has(scaleDegreeToken(targetSkillId))) {
            return undefined;
          }
          return {
            drill,
            exerciseId: item.exerciseId,
            targetSkillId,
            difficulty: item.difficulty,
            reason: item.reason,
          } satisfies EarTrainingQueueItem;
        })
        .filter((item): item is EarTrainingQueueItem => item !== undefined),
      length,
    );
  }

  const drills = (["interval", "chord-quality", "scale-degree"] as const).filter(
    (drill) => (byDrill.get(drill)?.length ?? 0) > 0,
  );
  const result: EarTrainingQueueItem[] = [];
  while (result.length < length && drills.length > 0) {
    const drill = drills[result.length % drills.length]!;
    const candidates = byDrill.get(drill)!;
    const drillIndex = Math.floor(result.length / drills.length) % candidates.length;
    result.push({ ...candidates[drillIndex]! });
  }
  return result;
}

function adaptiveMixedQueue(items: EarTrainingQueueItem[], length: number): EarTrainingQueueItem[] {
  if (items.length === 0) return [];
  const drillCount = new Set(items.map(({ drill }) => drill)).size;
  const result: EarTrainingQueueItem[] = [];
  let pending = items.map((item) => ({ ...item }));
  let recentDrills = new Set<EarTrainingDrill>();

  while (result.length < length) {
    if (pending.length === 0) {
      pending = items.map((item) => ({ ...item }));
      recentDrills = new Set();
    }

    let index = pending.findIndex((item) => !recentDrills.has(item.drill));
    if (index < 0) {
      recentDrills = new Set();
      index = 0;
    }

    const [next] = pending.splice(index, 1);
    if (!next) break;
    result.push(next);

    if (drillCount <= 1 || recentDrills.size >= drillCount - 1) {
      recentDrills = new Set();
    } else {
      recentDrills.add(next.drill);
    }
  }

  return result;
}

function cycleToLength(items: EarTrainingQueueItem[], length: number): EarTrainingQueueItem[] {
  if (items.length === 0) return [];
  return Array.from({ length }, (_, index) => ({ ...items[index % items.length]! }));
}

function drillForExercise(exerciseId: string): EarTrainingDrill | undefined {
  if (exerciseId === "ear.interval-recognition") return "interval";
  if (exerciseId === "ear.chord-quality-recognition") return "chord-quality";
  if (exerciseId === "ear.scale-degree-recognition") return "scale-degree";
  if (exerciseId === "ear.melody-dictation") return "melody-dictation";
  if (exerciseId.startsWith("ear.repertoire-transfer.")) return "repertoire-transfer";
  return undefined;
}

function drillEligibleForAnswerMode(
  drill: EarTrainingDrill,
  answerMode: EarTrainingAnswerMode,
): boolean {
  if (drill === "melody-dictation" || drill === "repertoire-transfer") {
    return answerMode === "play-back";
  }
  return true;
}

function inputsForAnswerMode(
  answerMode: EarTrainingAnswerMode,
  drill: EarTrainingDrill,
): InputSource[] {
  if (answerMode === "choice") return ["click"];
  if (answerMode === "listen") return ["click"];
  if (answerMode === "voice") return ["audio"];
  if (drill === "melody-dictation") return ["midi", "onscreen"];
  return ["midi", "onscreen"];
}

function scaleDegreeToken(skillId: string): string {
  return skillId.replace("pitch.scale-degree.", "");
}

function summarize(results: EarTrainingResultView[], streakDays: number): EarTrainingSummary {
  const byDrill: EarTrainingSummary["byDrill"] = {};
  const confusionCounts = new Map<string, EarTrainingConfusion>();
  for (const item of results) {
    const drill = byDrill[item.drill] ?? { total: 0, correct: 0, accuracy: 0 };
    drill.total += 1;
    drill.correct += item.result.correct ? 1 : 0;
    drill.accuracy = drill.correct / drill.total;
    byDrill[item.drill] = drill;

    for (const metric of item.result.metrics) {
      if (
        metric.kind !== "choice" ||
        metric.actual === undefined ||
        metric.actual === metric.expected
      )
        continue;
      const key = `${item.drill}:${metric.expected}:${metric.actual}`;
      const confusion = confusionCounts.get(key) ?? {
        drill: item.drill,
        expected: metric.expected,
        actual: metric.actual,
        count: 0,
      };
      confusion.count += 1;
      confusionCounts.set(key, confusion);
    }
  }

  const correct = results.filter(({ result }) => result.correct).length;
  return {
    total: results.length,
    correct,
    accuracy: results.length === 0 ? 0 : correct / results.length,
    xp: results.reduce((total, result) => total + result.xp, 0),
    streakDays,
    byDrill,
    recentResults: [...results],
    confusions: [...confusionCounts.values()],
  };
}
