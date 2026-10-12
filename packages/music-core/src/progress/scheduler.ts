// Practice queue, presented difficulty, ear ordering and confusion retries (catalog 5.4).
import type { SkillMastery } from "../types";
import { clamp } from "../theory/notes";
import { DAY_MS } from "./mastery";
import { aggregateMastery, isUnlocked, SKILL_GRAPH, type SkillGraph } from "./graph";
import { rankWeakest, topConfusions, type SkillSummary } from "./analytics";

export interface SchedulableExercise {
  id: string;
  skillIds: string[];
  /** Ear drill type ("interval", "chord-quality", "scale-degree", "cadence"), for ear ordering. */
  drill?: string;
}

export type QueueReason = "new" | "weakness" | "review";

export interface QueueItem {
  exerciseId: string;
  skillId: string;
  drill?: string;
  priority: number;
  reason: QueueReason;
  difficulty: number;
}

export const reviewIntervalDays = (observations: number, mastery: number) =>
  Math.max(1, 2 ** Math.min(8, Math.max(0, observations - 1)) * (0.75 + mastery));

/** +0.1 above 85% accuracy, -0.1 below 65%, only after 2 attempts. */
export function presentedDifficulty(mastery: number, summary?: SkillSummary): number {
  let adj = 0;
  if (summary && summary.attempts >= 2) {
    if (summary.accuracy > 0.85) adj = 0.1;
    else if (summary.accuracy < 0.65) adj = -0.1;
  }
  return clamp(0.4 + mastery * 0.4 + adj, 0.2, 0.9);
}

const WEAK_RANK_DEPTH = 5;

/**
 * One item per (exercise, unlocked skill), highest priority first.
 * `summaries` should already be scoped (instrument / independent) by the caller.
 */
export function buildQueue(
  exercises: SchedulableExercise[],
  state: Record<string, SkillMastery>,
  summaries: Record<string, SkillSummary>,
  now: number,
  graph: SkillGraph = SKILL_GRAPH,
): QueueItem[] {
  const weakest = rankWeakest(Object.values(summaries), 1)
    .slice(0, WEAK_RANK_DEPTH)
    .map((s) => s.skillId);
  const items: QueueItem[] = [];
  for (const ex of exercises) {
    for (const skillId of new Set(ex.skillIds)) {
      if (!isUnlocked(skillId, state, graph, now)) continue;
      const m = aggregateMastery(skillId, state, graph, now);
      const mastery = m?.mastery ?? 0;
      const observations = m?.observations ?? 0;
      const interval = reviewIntervalDays(observations, mastery);
      // Never practised counts as exactly due.
      const elapsed = m ? Math.max(0, (now - m.lastPracticed) / DAY_MS) : interval;
      const summary = summaries[skillId];
      const weakness = summary?.attempts ? 1 - summary.meanScore : 0.5;
      const rankIndex = weakest.indexOf(skillId);
      const weakRank = rankIndex < 0 ? 0 : (WEAK_RANK_DEPTH - rankIndex) / WEAK_RANK_DEPTH;
      const reason: QueueReason =
        observations === 0
          ? "new"
          : summary?.attempts && summary.accuracy < 0.7
            ? "weakness"
            : "review";
      items.push({
        exerciseId: ex.id,
        skillId,
        drill: ex.drill,
        priority: elapsed / interval + weakness * 1.5 + weakRank * 0.5,
        reason,
        difficulty: presentedDifficulty(mastery, summary),
      });
    }
  }
  return items.sort((a, b) => b.priority - a.priority);
}

export const EAR_DRILLS = [
  "interval",
  "chord-quality",
  "scale-degree",
  "cadence",
  "chord-function",
  "progression",
] as const;

/**
 * balanced: round-robin over the ear drill types, each in priority order.
 * adaptive: priority order, never the same drill twice in a row (items that would force a
 * repeat once only one drill type remains are dropped).
 */
export function orderEarQueue(queue: QueueItem[], mode: "balanced" | "adaptive"): QueueItem[] {
  const ear = queue.filter((q) => (EAR_DRILLS as readonly string[]).includes(q.drill ?? ""));
  if (mode === "balanced") {
    const lanes = EAR_DRILLS.map((d) => ear.filter((q) => q.drill === d));
    const out: QueueItem[] = [];
    for (let i = 0; lanes.some((l) => l.length > i); i++)
      for (const lane of lanes) if (lane[i]) out.push(lane[i]);
    return out;
  }
  const rest = [...ear];
  const out: QueueItem[] = [];
  while (rest.length) {
    const i = rest.findIndex((q) => q.drill !== out.at(-1)?.drill);
    if (i < 0) break;
    out.push(...rest.splice(i, 1));
  }
  return out;
}

export interface RetryItem {
  skillId: string;
  expected: string;
  actual: string;
  count: number;
  difficulty: number;
}

/** Up to 10 retries from the most frequent confusions, one per skill, at difficulty 0.5. */
export function retrySchedule(summaries: Record<string, SkillSummary>, limit = 10): RetryItem[] {
  const seen = new Set<string>();
  const out: RetryItem[] = [];
  for (const c of topConfusions(summaries)) {
    if (seen.has(c.skillId)) continue;
    seen.add(c.skillId);
    out.push({ ...c, difficulty: 0.5 });
    if (out.length >= limit) break;
  }
  return out;
}
