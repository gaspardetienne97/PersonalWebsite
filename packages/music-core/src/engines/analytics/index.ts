import { updateConfusion, type ConfusionMatrix, type ScoringEvent } from "@repo/music-core/domain";

export interface SkillStats {
  skillId: string;
  attempts: number;
  meanScore: number;
  meanLatencyMs?: number;
}

export class AnalyticsEngine {
  #confusion: ConfusionMatrix = new Map();
  #stats = new Map<string, SkillStats>();

  ingest(event: ScoringEvent): void {
    updateConfusion(this.#confusion, event);
    for (const skillId of event.skillIds) {
      const current = this.#stats.get(skillId) ?? { skillId, attempts: 0, meanScore: 0 };
      current.meanScore =
        (current.meanScore * current.attempts + event.partialCredit) / (current.attempts + 1);
      current.attempts += 1;
      const latencyMetrics = event.metrics.filter((metric) => metric.kind === "timing");
      if (latencyMetrics.length > 0) {
        const latency =
          latencyMetrics.reduce((sum, metric) => sum + Math.abs(metric.errorMs), 0) /
          latencyMetrics.length;
        current.meanLatencyMs =
          current.meanLatencyMs === undefined
            ? latency
            : (current.meanLatencyMs * (current.attempts - 1) + latency) / current.attempts;
      }
      this.#stats.set(skillId, current);
    }
  }

  confusions(expected: string): Record<string, number> {
    return Object.fromEntries(this.#confusion.get(expected) ?? []);
  }

  weakestSkills(n: number): SkillStats[] {
    return [...this.#stats.values()]
      .sort((a, b) => a.meanScore - b.meanScore || b.attempts - a.attempts)
      .slice(0, n);
  }
}
