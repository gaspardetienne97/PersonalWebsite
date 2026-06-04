/**
 * pipeline.ts - the learning pipeline.
 *
 * v1.1 had ExerciseResult, ScoringEvent, LearningEvidence, and SkillMastery as
 * shapes, but the *transformations between them* were implicit - meaning every
 * exercise could produce events slightly differently and the learning system
 * would quietly become inconsistent. These three pure functions make the bridge
 * explicit and canonical:
 *
 *   ExerciseResult ──resultToScoringEvent──► ScoringEvent
 *   ScoringEvent   ──scoringEventToEvidence─► LearningEvidence[]
 *   (mastery, evidence) ──applyScoringEventToSkillState──► SkillMastery (per skill)
 *
 * Every exercise now funnels through the same path: attribution (which skills),
 * evidence (how much it moves them), and mastery (the owned state). Pure and
 * deterministic, so the whole learning loop is testable without engines or UI.
 */
import type { ExerciseResult, ExerciseDefinition, ExercisePrompt } from "./exercise";
import type { ScoringEvent, ScoringMetric, ScoringTarget, ScoringResponse } from "./scoring";
import type { PracticeModality } from "./modality";
import type { UnixMs } from "./time";
import { type SkillMastery, type LearningEvidence, applyEvidence, applyDecay } from "./skill";

/* ------------------------------------------------------------------ */
/* 1. ExerciseResult -> ScoringEvent                                   */
/* ------------------------------------------------------------------ */

export interface ResultToEventArgs {
  result: ExerciseResult;
  sessionId: string;
  runId: string;
  exercise: Pick<ExerciseDefinition, "id" | "skillIds" | "capabilities">;
  prompt: Pick<ExercisePrompt, "id">;
  at: UnixMs;
  difficulty: number;
  modality?: PracticeModality;
  /** Id factory (injected so the function stays pure/deterministic in tests). */
  makeId: () => string;
}

/**
 * Canonicalize a graded run into the atomic learning record. Copies skill and
 * capability attribution from the exercise definition so every event is
 * attributable, and carries the rich metrics/target/response straight through
 * so it is also diagnosable.
 */
export function resultToScoringEvent(args: ResultToEventArgs): ScoringEvent {
  const { result, exercise } = args;
  const event: ScoringEvent = {
    id: args.makeId(),
    sessionId: args.sessionId,
    exerciseId: exercise.id,
    runId: args.runId,
    skillIds: [...exercise.skillIds],
    capabilities: [...exercise.capabilities],
    at: args.at,
    correct: result.correct,
    partialCredit: clamp01(result.score),
    difficulty: clamp01(args.difficulty),
    metrics: result.metrics,
    ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
    ...(args.modality !== undefined ? { modality: args.modality } : {}),
    ...(result.target !== undefined ? { target: result.target } : {}),
    ...(result.response !== undefined ? { response: result.response } : {}),
  };
  return event;
}

/* ------------------------------------------------------------------ */
/* 2. ScoringEvent -> LearningEvidence[]                               */
/* ------------------------------------------------------------------ */

/**
 * Produce one evidence item per skill the event touched. Weight rises with
 * difficulty: clean performance on a hard item is stronger evidence of mastery
 * than the same on an easy one. Performance is the event's partial credit, so
 * partial successes move mastery partially (not all-or-nothing).
 */
export function scoringEventToEvidence(event: ScoringEvent): LearningEvidence[] {
  const performance = clamp01(event.partialCredit);
  // Difficulty in [0,1] maps to a weight in [0.5, 1.5]: harder => heavier.
  const weight = 0.5 + event.difficulty;
  return event.skillIds.map((skillId) => ({
    skillId,
    performance,
    weight,
    at: event.at,
  }));
}

/* ------------------------------------------------------------------ */
/* 3. (mastery, event) -> updated SkillMastery                        */
/* ------------------------------------------------------------------ */

/**
 * Apply one scoring event to a map of skill mastery states. For each touched
 * skill: first decay to the event time (forgetting since last practice), then
 * fold in the new evidence. Returns a new map; never mutates input (the Skill
 * Graph owns mastery and this is the only sanctioned update path).
 *
 * @param current  skillId -> SkillMastery (may be missing entries; caller seeds
 *                 with initialMastery for first-seen skills)
 */
export function applyScoringEventToSkillState(
  current: ReadonlyMap<string, SkillMastery>,
  event: ScoringEvent,
  seed: (skillId: string) => SkillMastery,
): Map<string, SkillMastery> {
  const next = new Map(current);
  const evidence = scoringEventToEvidence(event);
  for (const ev of evidence) {
    const existing = next.get(ev.skillId) ?? seed(ev.skillId);
    const decayed = applyDecay(existing, event.at);
    next.set(ev.skillId, applyEvidence(decayed, ev));
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Confusion matrix - the analytics primitive the moat depends on      */
/* ------------------------------------------------------------------ */

/**
 * A confusion matrix over choice/pitch answers: expected label -> (answered
 * label -> count). This is what powers "you confuse m6 with P5" and lets the
 * scheduler target real weak spots. Built incrementally from scoring events.
 */
export type ConfusionMatrix = Map<string, Map<string, number>>;

export function updateConfusion(matrix: ConfusionMatrix, event: ScoringEvent): void {
  for (const m of event.metrics) {
    const pair = confusionPair(m);
    if (!pair) continue;
    const [expected, actual] = pair;
    const row = matrix.get(expected) ?? new Map<string, number>();
    row.set(actual, (row.get(actual) ?? 0) + 1);
    matrix.set(expected, row);
  }
}

function confusionPair(m: ScoringMetric): [string, string] | undefined {
  if (m.kind === "choice") {
    return [m.expected, m.actual ?? "(no answer)"];
  }
  if (m.kind === "pitch" && m.actualMidi !== undefined) {
    return [pitchClassName(m.expectedMidi), pitchClassName(m.actualMidi)];
  }
  return undefined;
}

const PC_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function pitchClassName(midi: number): string {
  return PC_NAMES[((midi % 12) + 12) % 12]!;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Re-exported for convenience: also surface target/response helpers. */
export type { ScoringTarget, ScoringResponse };
