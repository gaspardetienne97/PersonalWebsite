// Skill graph: seed, unlocking, umbrella aggregation, capability summaries (catalog 5.3).
import type { Capability, Skill, SkillMastery, SkillRelationship } from "../types";
import seed from "../data/skill-graph-seed.json";
import { decayMastery } from "./mastery";

export interface SkillGraph {
  skills: Skill[];
  relationships: SkillRelationship[];
}

export const SKILL_GRAPH: SkillGraph = seed as SkillGraph;

export const DEFAULT_UNLOCK_THRESHOLD = 0.6;
export const MASTERED = 0.8;

export const findSkill = (skillId: string, graph: SkillGraph = SKILL_GRAPH) =>
  graph.skills.find((s) => s.id === skillId);

export const skillName = (skillId: string, graph: SkillGraph = SKILL_GRAPH) =>
  findSkill(skillId, graph)?.name ?? skillId;

export const componentChildren = (skillId: string, graph: SkillGraph) =>
  graph.relationships.filter((r) => r.kind === "component" && r.from === skillId).map((r) => r.to);

/** The skill plus every skill under it through component edges. */
export function withDescendants(skillId: string, graph: SkillGraph = SKILL_GRAPH): string[] {
  const out = new Set([skillId]);
  for (const id of out) for (const child of componentChildren(id, graph)) out.add(child);
  return [...out];
}

/**
 * Current estimate for any skill. Umbrella skills (with component children) are the mean of
 * their children, an untouched child counting as zero. Leaves are their own decayed state.
 */
export function aggregateMastery(
  skillId: string,
  state: Record<string, SkillMastery>,
  graph: SkillGraph,
  now: number,
): SkillMastery | undefined {
  const children = componentChildren(skillId, graph);
  if (children.length === 0) return state[skillId] ? decayMastery(state[skillId], now) : undefined;
  const parts = children.map((c) => aggregateMastery(c, state, graph, now));
  const touched = parts.filter((p) => p !== undefined);
  if (touched.length === 0) return undefined;
  const mean = (f: (p: SkillMastery) => number) =>
    parts.reduce((sum, p) => sum + (p ? f(p) : 0), 0) / parts.length;
  return {
    skillId,
    mastery: mean((p) => p.mastery),
    confidence: mean((p) => p.confidence),
    decayRate: touched[0].decayRate,
    lastPracticed: Math.max(...touched.map((p) => p.lastPracticed)),
    observations: touched.reduce((sum, p) => sum + p.observations, 0),
  };
}

export const currentMastery = (
  skillId: string,
  state: Record<string, SkillMastery>,
  graph: SkillGraph,
  now: number,
) => aggregateMastery(skillId, state, graph, now)?.mastery ?? 0;

/** Unlocked when every prerequisite into the skill is at or above its threshold (default 0.6). */
export function isUnlocked(
  skillId: string,
  state: Record<string, SkillMastery>,
  graph: SkillGraph = SKILL_GRAPH,
  now: number = Date.now(),
): boolean {
  return graph.relationships
    .filter((r) => r.kind === "prerequisite" && r.to === skillId)
    .every(
      (r) => currentMastery(r.from, state, graph, now) >= (r.threshold ?? DEFAULT_UNLOCK_THRESHOLD),
    );
}

export function groupByCapability(graph: SkillGraph = SKILL_GRAPH): Record<Capability, Skill[]> {
  const out = { pitch: [], rhythm: [], harmony: [], reading: [], technique: [], ear: [] } as Record<
    Capability,
    Skill[]
  >;
  for (const s of graph.skills) if (!s.deprecated) out[s.capability].push(s);
  return out;
}

export interface CapabilitySummary {
  capability: Capability;
  total: number;
  mastered: number;
  average: number;
}

/** Per capability: skill count, skills at >= 0.8, and mean current mastery (untouched = 0). */
export function capabilitySummary(
  state: Record<string, SkillMastery>,
  graph: SkillGraph,
  now: number,
): CapabilitySummary[] {
  return Object.entries(groupByCapability(graph)).map(([capability, skills]) => {
    const values = skills.map((s) => currentMastery(s.id, state, graph, now));
    return {
      capability: capability as Capability,
      total: skills.length,
      mastered: values.filter((v) => v >= MASTERED).length,
      average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
    };
  });
}
