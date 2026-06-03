import type { Capability } from "./capability";
import type { InstrumentId } from "./instrument";
import type { UnixMs } from "./time";

/**
 * Skill - a node in the Skill Graph: one trainable musicianship concept.
 *
 * The Skill Graph is the canonical progression model. Every Exercise declares
 * the skills it advances, and progression, recommendations, the AI coach,
 * achievements, and routines all read from the graph. This is the schema
 * everything else hangs from, so it is designed first.
 */
export interface Skill {
  /** Stable slug, namespaced by capability, e.g. "harmony.ii-v-i". */
  id: string;
  name: string;
  /** The single capability this skill belongs to. */
  capability: Capability;
  description?: string;
  /**
   * Instruments on which this skill is meaningfully practiced.
   * Omit/empty for instrument-agnostic skills (e.g. interval recognition by ear).
   */
  instruments?: InstrumentId[];
  /** Inherent difficulty band, for ordering and recommendations. */
  level?: "beginner" | "early-intermediate" | "intermediate" | "advanced";
  /** Free-form tags for search/recommendation ("jazz", "fretboard", ...). */
  tags?: string[];
  /** Schema/version of this node; graphs evolve (rename/split/merge). */
  version: number;
  deprecated?: boolean;
  /** If deprecated/split, the node ids that supersede this one. */
  replacedBy?: string[];
}

export enum SkillRelationKind {
  /** `from` should be reasonably mastered before `to` is unlocked. */
  Prerequisite = "prerequisite",
  /** `to` is a sub-component of `from` (decomposition for the skill tree). */
  Component = "component",
  /** Loosely associated; used to suggest next skills, never to gate. */
  Related = "related",
}

export interface SkillRelationship {
  from: string; // Skill.id
  to: string; // Skill.id
  kind: SkillRelationKind;
  /**
   * For prerequisites: mastery of `from` (0-1) required before `to` unlocks.
   * Ignored for other kinds.
   */
  threshold?: number;
}

/**
 * SkillMastery - per-user mastery state for one skill.
 *
 * OWNED BY THE SKILL GRAPH. Analytics computes LearningEvidence from scoring
 * events and submits it; the graph folds it in and is the single source of
 * truth. This prevents the "user did an exercise" vs "skill 62%->68%" drift.
 */
export interface SkillMastery {
  skillId: string;
  /** Best current estimate of ability, 0-1. */
  mastery: number;
  /** Trust in `mastery` given quantity/recency of evidence, 0-1. */
  confidence: number;
  /** Per-day exponential forgetting rate applied to mastery (e.g. 0.02). */
  decayRate: number;
  lastPracticed?: UnixMs;
  /** Count of evidence items folded in (drives confidence growth). */
  observations: number;
}

/**
 * LearningEvidence - one observation about a skill, derived by Analytics from a
 * ScoringEvent. Analytics *produces* this; the Skill Graph *consumes* it.
 */
export interface LearningEvidence {
  skillId: string;
  /** Blended performance for this observation, 0-1 (correctness + accuracy). */
  performance: number;
  /** Observation weight - harder items / cleaner signal weigh more. */
  weight: number;
  at: UnixMs;
}

/** A fresh, unpracticed mastery record. */
export function initialMastery(skillId: string, decayRate = 0.02): SkillMastery {
  return {
    skillId,
    mastery: 0,
    confidence: 0,
    decayRate,
    observations: 0,
  };
}

/**
 * Apply time-based forgetting up to `now`. Both mastery AND confidence decay:
 * skill fades, and our certainty about a long-ago measurement fades too (so a
 * skill drilled heavily two years ago is not treated as reliably known today).
 * Pure function; the graph owns the result.
 */
export function applyDecay(m: SkillMastery, now: UnixMs): SkillMastery {
  if (m.lastPracticed === undefined) return m;
  const days = (now - m.lastPracticed) / 86_400_000;
  if (days <= 0) return m;
  const masteryDecay = Math.exp(-m.decayRate * days);
  // Confidence decays more slowly than mastery (half the rate) - we forget the
  // skill faster than we forget that we once had it, but both fade.
  const confidenceDecay = Math.exp(-0.5 * m.decayRate * days);
  return {
    ...m,
    mastery: clamp01(m.mastery * masteryDecay),
    confidence: clamp01(m.confidence * confidenceDecay),
  };
}

/**
 * Fold one evidence item into mastery. v1 heuristic: EMA toward observed
 * performance, with confidence rising as observations accumulate. Deliberately
 * simple and replaceable - ownership and call site are fixed; the math (e.g. a
 * later expected-performance/surprise model) can evolve without touching
 * callers. We hold off on difficulty-aware surprise updating until there is
 * real data to tune it against.
 */
export function applyEvidence(m: SkillMastery, e: LearningEvidence): SkillMastery {
  const CONFIDENCE_K = 8; // observations needed to reach ~0.5 confidence
  const learnRate = clamp01(0.3 * e.weight);
  const mastery = clamp01(m.mastery + learnRate * (e.performance - m.mastery));
  const observations = m.observations + 1;
  const confidence = observations / (observations + CONFIDENCE_K);
  return {
    ...m,
    mastery,
    observations,
    confidence,
    lastPracticed: e.at,
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
