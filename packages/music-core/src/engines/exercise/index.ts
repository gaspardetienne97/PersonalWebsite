import {
  Capability,
  resultToScoringEvent,
  unixMs,
  type ExerciseDefinition,
  type NoteEvent,
  type ScoringEvent,
} from "@repo/music-core/domain";
import type { AnalyticsEngine } from "@repo/music-core/engines/analytics";
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
  now?: () => number;
}

export async function runExerciseThroughPipeline(
  args: RunExerciseArgs,
): Promise<{ event: ScoringEvent; xp: number }> {
  const ctx = { targetSkillIds: args.exercise.skillIds, difficulty: 0.6 };
  const prompt = args.exercise.generate(ctx);
  const run = args.exercise.createRun(prompt, ctx);
  for (const event of args.input) run.accept(event);
  const result = run.finish({ reason: "completed" });
  const event = resultToScoringEvent({
    result,
    sessionId: args.sessionId,
    runId: args.runId,
    exercise: args.exercise,
    prompt,
    at: unixMs(args.now?.() ?? Date.now()),
    difficulty: ctx.difficulty,
    modality: inferModality(args.exercise.capabilities),
    makeId: () => crypto.randomUUID(),
  });

  await args.services.skills.ingest(event);
  args.services.analytics.ingest(event);
  const xp = args.services.progress.ingest(event);
  return { event, xp };
}

function inferModality(capabilities: Capability[]) {
  return capabilities.includes(Capability.EarTraining) ? "heard" : "played";
}
