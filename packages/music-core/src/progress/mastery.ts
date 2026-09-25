// Skill mastery estimate (scoring rules 3-4). The only place mastery changes.
import { isMasteryEligible, type ScoringEvent, type SkillMastery } from "../types";
import { clamp01 } from "../theory/notes";

export const DAY_MS = 86_400_000;
export const DEFAULT_DECAY_RATE = 0.02;
export const REVIEW_DROP = 0.1;

/** Current estimate at `now`. Does not move lastPracticed, so reading twice never double-decays. */
export function decayMastery(m: SkillMastery, now: number): SkillMastery {
  const days = Math.max(0, (now - m.lastPracticed) / DAY_MS);
  return {
    ...m,
    mastery: m.mastery * Math.exp(-m.decayRate * days),
    confidence: m.confidence * Math.exp(-0.5 * m.decayRate * days),
  };
}

/** Decay to the event time first, then fold one evidence item in (EMA). */
export function applyEvidence(
  m: SkillMastery | undefined,
  skillId: string,
  performance: number,
  difficulty: number,
  at: number,
): SkillMastery {
  const base = m
    ? decayMastery(m, at)
    : {
        skillId,
        mastery: 0,
        confidence: 0,
        decayRate: DEFAULT_DECAY_RATE,
        lastPracticed: at,
        observations: 0,
      };
  const weight = 0.5 + clamp01(difficulty);
  const learnRate = clamp01(0.3 * weight);
  const mastery = clamp01(base.mastery + learnRate * (clamp01(performance) - base.mastery));
  const observations = base.observations + 1;
  return {
    ...base,
    mastery,
    observations,
    confidence: observations / (observations + 8),
    lastPracticed: Math.max(base.lastPracticed, at),
    lastMeasured: mastery,
  };
}

/** Historical records without assistance still count (scoring rules 1); anything labelled must be independent. */
export const countsForMastery = (e: Pick<ScoringEvent, "assistance">) =>
  e.assistance === undefined || isMasteryEligible(e);

/** Idempotent by event id; events fold in time order. Every seen id is marked processed. */
export function ingestEvents(
  state: Record<string, SkillMastery>,
  processed: string[],
  events: ScoringEvent[],
): { state: Record<string, SkillMastery>; processed: string[]; changed: string[] } {
  const seen = new Set(processed);
  const next = { ...state };
  const changed = new Set<string>();
  const fresh = events.filter((e) => !seen.has(e.id)).sort((a, b) => a.at - b.at);
  for (const e of fresh) {
    seen.add(e.id);
    if (!countsForMastery(e)) continue;
    for (const skillId of new Set(e.skillIds)) {
      next[skillId] = applyEvidence(next[skillId], skillId, e.partialCredit, e.difficulty, e.at);
      changed.add(skillId);
    }
  }
  return { state: next, processed: [...seen], changed: [...changed] };
}

/** A ten-point drop from the last measured value is due for review. */
export function isDueForReview(m: SkillMastery, now: number): boolean {
  if (m.lastMeasured === undefined) return false;
  return m.lastMeasured - decayMastery(m, now).mastery >= REVIEW_DROP - 1e-9;
}
