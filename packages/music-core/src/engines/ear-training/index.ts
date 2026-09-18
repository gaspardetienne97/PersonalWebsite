import type {
  ExercisePrompt,
  ExerciseResult,
  FeedbackItem,
  InputSource,
  InstrumentId,
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
  SCALE_DEGREE_SETS,
  degreeTokensForScaleDegreeSet,
  scaleDegreeLabelMode,
  type ScaleDegreeLabelMode,
  type ScaleDegreeSetId,
} from "@repo/music-core/exercises/scale-degree-recognition";

export {
  builtEarTrainingCapabilities,
  currentEarTrainingLearningPath,
  EAR_TRAINING_CAPABILITIES,
  EAR_TRAINING_LEARNING_PATH,
  EAR_TRAINING_LEARNING_PATH_DEFINITION,
  type EarTrainingCapability,
  type EarTrainingCapabilityStatus,
  type EarTrainingLearningPathStage,
} from "./curriculum";
export {
  clampEarAnswerMode,
  EAR_TRAINING_DRILLS,
  EAR_TRAINING_PATH_HREF,
  earTrainingDrillBySlug,
  earTrainingDrillForDrill,
  earTrainingDrillHref,
  earTrainingHrefForSkill,
  legacyEarTrainingHref,
  scaleDegreeSkillIds,
  type EarTrainingDrillDefinition,
  type EarTrainingDrillSlug,
  type EarTrainingHrefOptions,
} from "./drills";
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
  instrument?: InstrumentId;
  drill: EarTrainingDrill | "mixed";
  answerMode: EarTrainingAnswerMode;
  feedbackMode: EarTrainingFeedbackMode;
  length?: number;
  queueMode?: "adaptive" | "balanced";
  scaleDegreeSet?: ScaleDegreeSetId;
  scaleDegreeLabelMode?: ScaleDegreeLabelMode;
  deferPerformanceAnswers?: boolean;
}

export type EarTrainingConfigDrill = Exclude<EarTrainingDrill, "repertoire-transfer"> | "mixed";

export interface EarTrainingConfig {
  drill: EarTrainingConfigDrill;
  answerMode: EarTrainingAnswerMode;
  feedbackMode: EarTrainingFeedbackMode;
  scaleDegreeSet: ScaleDegreeSetId;
  scaleDegreeLabelMode: ScaleDegreeLabelMode;
}

export type EarTrainingConfigSource = {
  get?: (key: string) => string | null;
  drill?: unknown;
  answer?: unknown;
  answerMode?: unknown;
  feedback?: unknown;
  feedbackMode?: unknown;
  level?: unknown;
  scaleDegreeSet?: unknown;
  labels?: unknown;
  labelMode?: unknown;
  scaleDegreeLabelMode?: unknown;
};

export const EAR_TRAINING_DEFAULT_CONFIG: EarTrainingConfig = {
  drill: "mixed",
  answerMode: "choice",
  feedbackMode: "practice",
  scaleDegreeSet: "anchor",
  scaleDegreeLabelMode: "degree",
};

export function normalizeEarTrainingConfig(source: EarTrainingConfigSource): EarTrainingConfig {
  const rawDrill = readEarConfigValue(source, ["drill"]);
  const rawAnswer = readEarConfigValue(source, ["answer", "answerMode"]);
  const rawFeedback = readEarConfigValue(source, ["feedback", "feedbackMode"]);
  const rawLevel = readEarConfigValue(source, ["level", "scaleDegreeSet"]);
  const rawLabels = readEarConfigValue(source, ["labels", "labelMode", "scaleDegreeLabelMode"]);

  return {
    drill: normalizeEarDrill(rawDrill),
    answerMode: normalizeEarAnswerMode(rawAnswer),
    feedbackMode: rawFeedback === "test" ? "test" : EAR_TRAINING_DEFAULT_CONFIG.feedbackMode,
    scaleDegreeSet: SCALE_DEGREE_SETS.some((set) => set.id === rawLevel)
      ? (rawLevel as ScaleDegreeSetId)
      : EAR_TRAINING_DEFAULT_CONFIG.scaleDegreeSet,
    scaleDegreeLabelMode: scaleDegreeLabelMode(rawLabels),
  };
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
  targetSkillIds: string[];
  difficulty: number;
  reason: ScheduledExercise["reason"];
}

export interface EarTrainingResultView {
  drill: EarTrainingDrill;
  targetSkillId: string;
  targetSkillIds: string[];
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

export interface EarTrainingRetryScheduleOptions {
  limit?: number;
}

export interface EarTrainingSessionState {
  status: "ready" | "active" | "summary" | "abandoned";
  options: EarTrainingSessionOptions;
  queue: EarTrainingQueueItem[];
  currentIndex: number;
  currentPrompt?: EarTrainingPromptBase;
  heard: boolean;
  awaitingContinue: boolean;
  answerRevealed: boolean;
  results: EarTrainingResultView[];
  feedback: FeedbackItem[];
  sessionXp: number;
  error?: string;
  summary?: EarTrainingSummary;
}

export function buildEarTrainingRetrySchedule(
  summary: EarTrainingSummary,
  options: EarTrainingRetryScheduleOptions = {},
): ScheduledExercise[] {
  const limit = Math.max(1, Math.floor(options.limit ?? 10));
  const scheduled: ScheduledExercise[] = [];
  const seen = new Set<string>();

  for (const confusion of [...summary.confusions].sort(
    (left, right) =>
      right.count - left.count ||
      left.drill.localeCompare(right.drill) ||
      left.expected.localeCompare(right.expected),
  )) {
    const item = retryScheduleItem(confusion);
    if (!item || seen.has(item.targetSkillIds[0]!)) continue;
    seen.add(item.targetSkillIds[0]!);
    scheduled.push(item);
    if (scheduled.length >= limit) break;
  }

  return scheduled;
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
  #awaitingContinue = false;
  #answerRevealed = false;
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
      awaitingContinue: this.#awaitingContinue,
      answerRevealed: this.#answerRevealed,
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

  armCurrentAnswer(): void {
    if (this.#status !== "active" || this.#awaitingContinue || !this.#currentPrompt) return;
    this.#host.setInputEnabled(true);
  }

  disarmCurrentAnswer(): void {
    if (this.#status !== "active" || this.#awaitingContinue || !this.#currentPrompt) return;
    this.#host.setInputEnabled(false);
  }

  async answerChoice(token: string): Promise<void> {
    this.#assertUsable();
    if (this.#awaitingContinue || this.#finishing) return;
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
    if (!this.#answerRevealed) throw new Error("Reveal the answer before self-rating");
    if (this.#finishing) return;
    if (this.#currentPrompt.choices.length === 0) {
      throw new Error("This prompt cannot be self-assessed in listening mode");
    }

    // A missed self-report has no observed wrong choice. The extra index decodes
    // to undefined in the prompt's choices instead of inventing a confusion.
    const tokens = this.#currentPrompt.choices.map((choice) => choice.token);
    this.dependencies.router.push(
      choiceAnswerEvent(heardCorrectly ? this.#currentPrompt.answerToken : "__not_recalled", [
        ...tokens,
        "__not_recalled",
      ]),
    );
    const completion = this.#completion;
    if (completion) await completion;
  }

  revealAnswer(): void {
    if (this.#status !== "active" || this.options.answerMode !== "listen" || !this.#heard) return;
    this.#answerRevealed = true;
    this.#notify();
  }

  continue(): void {
    if (this.#disposed || !this.#awaitingContinue) return;
    this.#awaitingContinue = false;
    this.#advance();
  }

  advanceListening(): void {
    if (
      this.#disposed ||
      this.#status !== "active" ||
      this.options.answerMode !== "listen-along" ||
      !this.#heard
    )
      return;
    this.#host.cancel();
    this.#advance();
  }

  #advance(): void {
    this.#currentIndex += 1;
    this.#feedback = [];
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
      inputEnabled:
        this.options.answerMode !== "listen-along" &&
        !(
          this.options.deferPerformanceAnswers &&
          (this.options.answerMode === "play-back" || this.options.answerMode === "voice")
        ),
      context: {
        targetSkillIds: item.targetSkillIds,
        difficulty: item.difficulty,
        instrument: this.options.answerMode === "voice" ? "voice" : this.options.instrument,
        metadata: {
          assistance: this.options.answerMode === "listen" ? "self-assessed" : "independent",
          modality:
            this.options.answerMode === "voice"
              ? "sung"
              : this.options.answerMode === "play-back"
                ? "played"
                : "heard",
          ...(this.options.scaleDegreeSet !== undefined
            ? {
                scaleDegreeSet: this.options.scaleDegreeSet,
                scaleDegreeLabelMode: this.options.scaleDegreeLabelMode,
              }
            : {}),
        },
      },
    }) as ExercisePrompt<EarTrainingPromptBase>;

    this.#status = "active";
    this.#currentPrompt = prompt.payload;
    this.#heard = false;
    this.#answerRevealed = false;
    this.#feedback = [];
    this.#notify();
    return prompt.payload;
  }

  #handleInput(): void {
    if (
      !this.#heard ||
      this.#status !== "active" ||
      this.#finishing ||
      this.#awaitingContinue ||
      this.options.answerMode === "listen-along" ||
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
        targetSkillIds: [...item.targetSkillIds],
        prompt,
        result: outcome.result,
        event: outcome.event,
        xp: outcome.xp,
      });
      this.#feedback = this.options.feedbackMode === "practice" ? [...outcome.result.feedback] : [];
      if (this.options.feedbackMode === "practice" && this.options.answerMode !== "listen") {
        this.#awaitingContinue = true;
        this.#host.setInputEnabled(false);
      } else {
        this.#advance();
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
      targetSkillIds: [...item.targetSkillIds],
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
            targetSkillIds: [...item.targetSkillIds],
            difficulty: item.difficulty,
            reason: item.reason,
          } satisfies EarTrainingQueueItem;
        })
        .filter((item): item is EarTrainingQueueItem => item !== undefined),
      length,
    );
  }

  const drills = (["interval", "chord-quality", "scale-degree", "cadence"] as const).filter(
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

function normalizeEarDrill(value: string | undefined): EarTrainingConfigDrill {
  if (
    value === "interval" ||
    value === "chord-quality" ||
    value === "cadence" ||
    value === "scale-degree" ||
    value === "melody-dictation" ||
    value === "mixed"
  ) {
    return value;
  }
  return EAR_TRAINING_DEFAULT_CONFIG.drill;
}

function normalizeEarAnswerMode(value: string | undefined): EarTrainingAnswerMode {
  if (value === "play") return "play-back";
  if (value === "play-back" || value === "voice" || value === "listen" || value === "listen-along")
    return value;
  return EAR_TRAINING_DEFAULT_CONFIG.answerMode;
}

function readEarConfigValue(source: EarTrainingConfigSource, keys: string[]): string | undefined {
  if (typeof source.get === "function") {
    for (const key of keys) {
      const value = source.get(key);
      if (value !== null) return value;
    }
    return undefined;
  }
  for (const key of keys) {
    const value = source[key as keyof EarTrainingConfigSource];
    if (value !== undefined && value !== null) return String(value);
  }
  return undefined;
}

export function drillForExercise(exerciseId: string): EarTrainingDrill | undefined {
  if (exerciseId === "ear.interval-recognition") return "interval";
  if (exerciseId === "ear.chord-quality-recognition") return "chord-quality";
  if (exerciseId === "ear.cadence-recognition") return "cadence";
  if (exerciseId === "ear.scale-degree-recognition") return "scale-degree";
  if (exerciseId === "ear.melody-dictation") return "melody-dictation";
  if (exerciseId.startsWith("ear.repertoire-transfer.")) return "repertoire-transfer";
  return undefined;
}

export function drillEligibleForAnswerMode(
  drill: EarTrainingDrill,
  answerMode: EarTrainingAnswerMode,
): boolean {
  if (drill === "melody-dictation" || drill === "repertoire-transfer") {
    return answerMode === "play-back";
  }
  if (drill === "cadence")
    return answerMode === "choice" || answerMode === "listen" || answerMode === "listen-along";
  return true;
}

function inputsForAnswerMode(
  answerMode: EarTrainingAnswerMode,
  drill: EarTrainingDrill,
): InputSource[] {
  if (answerMode === "choice") return ["click"];
  if (answerMode === "listen") return ["click"];
  if (answerMode === "listen-along") return [];
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

    for (const confusion of phraseDegreeConfusions(item)) {
      const key = `${item.drill}:${confusion.expected}:${confusion.actual}`;
      const existing = confusionCounts.get(key) ?? confusion;
      existing.count += 1;
      confusionCounts.set(key, existing);
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

function phraseDegreeConfusions(item: EarTrainingResultView): EarTrainingConfusion[] {
  if (item.drill !== "melody-dictation" && item.drill !== "repertoire-transfer") {
    return [];
  }
  const promptDegrees = (item.prompt as { degrees?: unknown }).degrees;
  const answerDegrees = item.result.answer;
  if (!isStringArray(promptDegrees) || !isStringArray(answerDegrees)) return [];

  const result: EarTrainingConfusion[] = [];
  for (const [index, expected] of promptDegrees.entries()) {
    const metric = item.result.metrics[index];
    if (metric?.kind !== "pitch") continue;
    const actual = answerDegrees[index];
    if (actual === undefined || actual === expected) continue;
    result.push({
      drill: item.drill,
      expected,
      actual,
      count: 0,
    });
  }
  return result;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function retryScheduleItem(confusion: EarTrainingConfusion): ScheduledExercise | undefined {
  if (
    confusion.drill === "scale-degree" ||
    confusion.drill === "melody-dictation" ||
    confusion.drill === "repertoire-transfer"
  ) {
    return retryItem("ear.scale-degree-recognition", `pitch.scale-degree.${confusion.expected}`);
  }
  if (confusion.drill === "interval") {
    return retryItem("ear.interval-recognition", `pitch.interval.${confusion.expected}`);
  }
  if (confusion.drill === "chord-quality") {
    const skillId = chordQualitySkillId(confusion.expected);
    return skillId === undefined ? undefined : retryItem("ear.chord-quality-recognition", skillId);
  }
  if (confusion.drill === "cadence") {
    return retryItem("ear.cadence-recognition", `ear.cadences.${confusion.expected}`);
  }
  return undefined;
}

function retryItem(exerciseId: string, skillId: string): ScheduledExercise {
  return {
    exerciseId,
    targetSkillIds: [skillId],
    difficulty: 0.5,
    reason: "weakness",
  };
}

function chordQualitySkillId(token: string): string | undefined {
  const skillIds: Record<string, string> = {
    major: "harmony.triad.major",
    minor: "harmony.triad.minor",
    diminished: "harmony.triad.diminished",
    augmented: "harmony.triad.augmented",
    "major-7": "harmony.seventh.major",
    "dominant-7": "harmony.seventh.dominant",
    "minor-7": "harmony.seventh.minor",
    "half-diminished-7": "harmony.seventh.half-diminished",
    "diminished-7": "harmony.seventh.diminished",
  };
  return skillIds[token];
}
