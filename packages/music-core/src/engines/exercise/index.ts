import {
  Capability,
  resultToScoringEvent,
  unixMs,
  type ExerciseContext,
  type ExerciseDefinition,
  type ExerciseFinishContext,
  type ExerciseLiveState,
  type ExercisePrompt,
  type ExerciseRun,
  type NoteEvent,
  type ScoringEvent,
  type UnixMs,
} from "@repo/music-core/domain";
import type { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import type { InputRouter } from "@repo/music-core/engines/input-router";
import type { ProgressEngine } from "@repo/music-core/engines/progress";
import type { SkillGraphStore } from "@repo/music-core/engines/skills";

export class ExerciseRegistry {
  #definitions = new Map<string, ExerciseDefinition>();

  register(definition: ExerciseDefinition): void {
    this.#definitions.set(definition.id, definition);
  }

  get(id: string): ExerciseDefinition {
    const definition = this.#definitions.get(id);
    if (!definition) throw new Error(`Exercise not registered: ${id}`);
    return definition;
  }

  list(): ExerciseDefinition[] {
    return [...this.#definitions.values()];
  }
}

export interface PipelineServices {
  skills: SkillGraphStore;
  analytics: AnalyticsEngine;
  progress: ProgressEngine;
}

export interface RunExerciseArgs {
  exercise: ExerciseDefinition;
  input: NoteEvent[];
  services: PipelineServices;
  sessionId: string;
  runId: string;
  context?: Partial<ExerciseContext>;
  now?: () => number;
  makeId?: () => string;
}

export async function runExerciseThroughPipeline(
  args: RunExerciseArgs,
): Promise<{ event: ScoringEvent; xp: number }> {
  const context = exerciseContext(args.exercise, args.context);
  const prompt = args.exercise.generate(context);
  const run = args.exercise.createRun(prompt, context);
  for (const event of args.input) run.accept(event);
  return finishExerciseRun({
    exercise: args.exercise,
    prompt,
    run,
    context,
    services: args.services,
    sessionId: args.sessionId,
    runId: args.runId,
    finishContext: { reason: "completed" },
    now: args.now,
    makeId: args.makeId,
  });
}

export interface ScheduledExercise {
  exerciseId: string;
  targetSkillIds: string[];
  difficulty: number;
  reason: "new" | "review" | "weakness";
}

export interface BuildQueueOptions {
  length: number;
  now?: UnixMs;
}

interface ScheduleCandidate extends ScheduledExercise {
  priority: number;
}

export class ExerciseScheduler {
  constructor(
    private readonly registry: ExerciseRegistry,
    private readonly skills: SkillGraphStore,
    private readonly analytics: AnalyticsEngine,
  ) {}

  buildQueue(options: BuildQueueOptions): ScheduledExercise[] {
    const length = Math.max(0, Math.floor(options.length));
    if (length === 0) return [];

    const now = options.now ?? unixMs(Date.now());
    const unlocked = new Set(this.skills.unlockedSkills().map((skill) => skill.id));
    const weakSkills = this.analytics.weakestSkills(this.registry.list().length);
    const weakRanks = new Map(
      weakSkills.map((stats, index) => [
        stats.skillId,
        (weakSkills.length - index) / weakSkills.length,
      ]),
    );
    const candidates = this.registry
      .list()
      .filter((definition) => definition.skillIds.some((skillId) => unlocked.has(skillId)))
      .map((definition) => this.#candidate(definition, unlocked, weakRanks, now))
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          a.exerciseId.localeCompare(b.exerciseId) ||
          a.targetSkillIds[0]!.localeCompare(b.targetSkillIds[0]!),
      );

    if (candidates.length === 0) return [];

    const queue: ScheduledExercise[] = [];
    while (queue.length < length) {
      for (const candidate of candidates) {
        if (queue.length >= length) break;
        queue.push(scheduleItem(candidate));
      }
    }
    return queue;
  }

  #candidate(
    definition: ExerciseDefinition,
    unlocked: ReadonlySet<string>,
    weakRanks: ReadonlyMap<string, number>,
    now: UnixMs,
  ): ScheduleCandidate {
    const targetSkillIds = definition.skillIds.filter((skillId) => unlocked.has(skillId));
    const ranked = targetSkillIds
      .map((skillId) =>
        scheduleSkill(skillId, this.skills, this.analytics, weakRanks.get(skillId) ?? 0, now),
      )
      .sort((a, b) => b.priority - a.priority || a.skillId.localeCompare(b.skillId));
    const primary = ranked[0]!;

    return {
      exerciseId: definition.id,
      targetSkillIds: [primary.skillId],
      difficulty: primary.difficulty,
      reason: primary.reason,
      priority: primary.priority,
    };
  }
}

interface ScheduledSkill {
  skillId: string;
  difficulty: number;
  priority: number;
  reason: ScheduledExercise["reason"];
}

function scheduleSkill(
  skillId: string,
  skills: SkillGraphStore,
  analytics: AnalyticsEngine,
  weakRank: number,
  now: UnixMs,
): ScheduledSkill {
  const mastery = skills.getMastery(skillId);
  const stats = analytics.getStats(skillId);
  const reviewIntervalDays = Math.max(
    1,
    Math.pow(2, Math.min(8, Math.max(0, mastery.observations - 1))) * (0.75 + mastery.mastery),
  );
  const elapsedDays =
    mastery.lastPracticed === undefined
      ? reviewIntervalDays
      : (now - mastery.lastPracticed) / DAY_MS;
  const reviewPriority = Math.max(0, elapsedDays / reviewIntervalDays);
  const weakness = stats === undefined ? 0.5 : 1 - stats.meanScore;
  const priority = reviewPriority + weakness * 1.5 + weakRank * 0.5;
  const adaptiveAdjustment =
    stats === undefined || stats.attempts < 2
      ? 0
      : stats.accuracy > 0.85
        ? 0.1
        : stats.accuracy < 0.65
          ? -0.1
          : 0;

  return {
    skillId,
    difficulty: clamp(0.4 + mastery.mastery * 0.4 + adaptiveAdjustment, 0.2, 0.9),
    priority,
    reason:
      mastery.observations === 0
        ? "new"
        : stats !== undefined && stats.accuracy < 0.7
          ? "weakness"
          : "review",
  };
}

function scheduleItem(candidate: ScheduleCandidate): ScheduledExercise {
  return {
    exerciseId: candidate.exerciseId,
    targetSkillIds: [...candidate.targetSkillIds],
    difficulty: candidate.difficulty,
    reason: candidate.reason,
  };
}

export interface StartExerciseRunArgs {
  exercise: ExerciseDefinition;
  sessionId: string;
  runId: string;
  context?: Partial<ExerciseContext>;
}

export interface ExerciseRunHostOptions {
  now?: () => number;
  makeId?: () => string;
}

interface ActiveExerciseRun {
  exercise: ExerciseDefinition;
  prompt: ExercisePrompt;
  run: ExerciseRun;
  context: ExerciseContext;
  sessionId: string;
  runId: string;
}

export class ExerciseRunHost {
  #active?: ActiveExerciseRun;
  #unsubscribe: () => void;

  constructor(
    router: InputRouter,
    private readonly services: PipelineServices,
    private readonly options: ExerciseRunHostOptions = {},
  ) {
    this.#unsubscribe = router.subscribe((event) => {
      if (this.#active?.exercise.inputs.includes(event.source)) {
        this.#active.run.accept(event);
      }
    });
  }

  get liveState(): ExerciseLiveState | undefined {
    return this.#active?.run.getLiveState();
  }

  get prompt(): ExercisePrompt | undefined {
    return this.#active?.prompt;
  }

  start(args: StartExerciseRunArgs): ExercisePrompt {
    if (this.#active) throw new Error("An exercise run is already active");

    const context = exerciseContext(args.exercise, args.context);
    const prompt = args.exercise.generate(context);
    this.#active = {
      exercise: args.exercise,
      prompt,
      run: args.exercise.createRun(prompt, context),
      context,
      sessionId: args.sessionId,
      runId: args.runId,
    };
    return prompt;
  }

  async finish(finishContext: ExerciseFinishContext = { reason: "completed" }) {
    const active = this.#active;
    if (!active) throw new Error("No exercise run is active");
    this.#active = undefined;

    return finishExerciseRun({
      ...active,
      services: this.services,
      finishContext,
      now: this.options.now,
      makeId: this.options.makeId,
    });
  }

  dispose(): void {
    this.#active = undefined;
    this.#unsubscribe();
  }
}

interface FinishExerciseRunArgs extends ActiveExerciseRun {
  services: PipelineServices;
  finishContext: ExerciseFinishContext;
  now?: () => number;
  makeId?: () => string;
}

async function finishExerciseRun(
  args: FinishExerciseRunArgs,
): Promise<{ event: ScoringEvent; xp: number }> {
  const result = args.run.finish(args.finishContext);
  const event = resultToScoringEvent({
    result,
    sessionId: args.sessionId,
    runId: args.runId,
    exercise: { ...args.exercise, skillIds: args.context.targetSkillIds },
    prompt: args.prompt,
    at: unixMs(args.now?.() ?? Date.now()),
    difficulty: args.context.difficulty,
    modality: inferModality(args.exercise.capabilities),
    makeId: args.makeId ?? (() => crypto.randomUUID()),
  });

  await args.services.skills.ingest(event);
  await args.services.analytics.ingest(event);
  const xp = args.services.progress.ingest(event);
  return { event, xp };
}

function exerciseContext(
  exercise: ExerciseDefinition,
  context: Partial<ExerciseContext> = {},
): ExerciseContext {
  const targetSkillIds = context.targetSkillIds ?? exercise.skillIds;
  if (
    targetSkillIds.length === 0 ||
    targetSkillIds.some((skillId) => !exercise.skillIds.includes(skillId))
  ) {
    throw new Error(`Exercise context targets skills outside ${exercise.id}`);
  }

  return {
    targetSkillIds: [...targetSkillIds],
    difficulty: clamp(context.difficulty ?? 0.6, 0, 1),
    ...(context.instrument !== undefined ? { instrument: context.instrument } : {}),
  };
}

function inferModality(capabilities: Capability[]) {
  return capabilities.includes(Capability.EarTraining) ? "heard" : "played";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const DAY_MS = 86_400_000;
