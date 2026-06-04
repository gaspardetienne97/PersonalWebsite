import { updateConfusion, type ConfusionMatrix, type ScoringEvent } from "@repo/music-core/domain";
import type { PracticeStore } from "@repo/music-core/engines/store";

export interface SkillStats {
  skillId: string;
  attempts: number;
  correctAttempts: number;
  accuracy: number;
  meanScore: number;
  meanReactionTimeMs?: number;
  chordSwitchSpeedMs?: number;
  consistency: number;
}

interface SkillAccumulator {
  stats: SkillStats;
  scoreM2: number;
  reactionAttempts: number;
  chordAttempts: number;
}

export class AnalyticsEngine {
  #confusionsBySkill = new Map<string, ConfusionMatrix>();
  #stats = new Map<string, SkillAccumulator>();
  #eventIds = new Set<string>();
  #loaded = false;
  #operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly store?: PracticeStore) {}

  load(): Promise<void> {
    return this.#enqueue(() => this.#load());
  }

  ingest(event: ScoringEvent): Promise<void> {
    return this.#enqueue(async () => {
      await this.#load();
      if (this.#eventIds.has(event.id)) return;

      if (this.store) await this.store.scoringEvents.put(event);
      this.#apply(event);
    });
  }

  confusions(skillId: string): Record<string, number> {
    const totals = new Map<string, number>();
    for (const row of this.#confusionsBySkill.get(skillId)?.values() ?? []) {
      for (const [actual, count] of row) {
        totals.set(actual, (totals.get(actual) ?? 0) + count);
      }
    }
    return Object.fromEntries(totals);
  }

  getStats(skillId: string): SkillStats | undefined {
    const stats = this.#stats.get(skillId)?.stats;
    return stats === undefined ? undefined : structuredClone(stats);
  }

  weakestSkills(n: number): SkillStats[] {
    return [...this.#stats.values()]
      .map(({ stats }) => structuredClone(stats))
      .sort(
        (a, b) =>
          a.accuracy - b.accuracy ||
          a.meanScore - b.meanScore ||
          a.consistency - b.consistency ||
          b.attempts - a.attempts,
      )
      .slice(0, n);
  }

  async #load(): Promise<void> {
    if (this.#loaded) return;

    if (this.store) {
      const events = await this.store.scoringEvents.all();
      events.sort((a, b) => Number(a.at) - Number(b.at) || a.id.localeCompare(b.id));
      for (const event of events) this.#apply(event);
    }
    this.#loaded = true;
  }

  #apply(event: ScoringEvent): void {
    if (this.#eventIds.has(event.id)) return;
    this.#eventIds.add(event.id);

    for (const skillId of new Set(event.skillIds)) {
      const confusion = this.#confusionsBySkill.get(skillId) ?? new Map();
      updateConfusion(confusion, event);
      this.#confusionsBySkill.set(skillId, confusion);

      const accumulator = this.#stats.get(skillId) ?? createAccumulator(skillId);
      updateStats(accumulator, event);
      this.#stats.set(skillId, accumulator);
    }
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.#operationQueue.then(operation, operation);
    this.#operationQueue = result.catch(() => undefined);
    return result;
  }
}

function createAccumulator(skillId: string): SkillAccumulator {
  return {
    stats: {
      skillId,
      attempts: 0,
      correctAttempts: 0,
      accuracy: 0,
      meanScore: 0,
      consistency: 1,
    },
    scoreM2: 0,
    reactionAttempts: 0,
    chordAttempts: 0,
  };
}

function updateStats(accumulator: SkillAccumulator, event: ScoringEvent): void {
  const stats = accumulator.stats;
  const nextAttempts = stats.attempts + 1;
  const scoreDelta = event.partialCredit - stats.meanScore;
  const nextMeanScore = stats.meanScore + scoreDelta / nextAttempts;
  accumulator.scoreM2 += scoreDelta * (event.partialCredit - nextMeanScore);

  stats.attempts = nextAttempts;
  stats.correctAttempts += event.correct ? 1 : 0;
  stats.accuracy = stats.correctAttempts / nextAttempts;
  stats.meanScore = nextMeanScore;
  const scoreDeviation = Math.sqrt(accumulator.scoreM2 / nextAttempts);
  stats.consistency = Math.max(0, 1 - scoreDeviation * 2);

  if (event.latencyMs !== undefined) {
    accumulator.reactionAttempts += 1;
    stats.meanReactionTimeMs = runningMean(
      stats.meanReactionTimeMs,
      event.latencyMs,
      accumulator.reactionAttempts,
    );
    if (event.metrics.some((metric) => metric.kind === "chord")) {
      accumulator.chordAttempts += 1;
      stats.chordSwitchSpeedMs = runningMean(
        stats.chordSwitchSpeedMs,
        event.latencyMs,
        accumulator.chordAttempts,
      );
    }
  }
}

function runningMean(current: number | undefined, value: number, count: number): number {
  return current === undefined ? value : current + (value - current) / count;
}
