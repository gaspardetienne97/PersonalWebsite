// Per-skill analytics and the confusion matrix (scoring rules 2 and 4, catalog 5.5).
// Stats are kept as mergeable sums in slices keyed skill x instrument x assistance, so an
// instrument-scoped or independent-only query merges slices instead of rescanning events.
import type { Instrument, ScoringEvent } from "../types";
import { noteName } from "../theory/notes";

export interface SkillStats {
  skillId: string;
  /** Slice scope. A merged view leaves these unset. */
  instrument?: Instrument;
  independent?: boolean;
  attempts: number;
  correct: number;
  scoreSum: number;
  scoreSqSum: number;
  reactionSumMs: number;
  reactionCount: number;
  chordSwitchSumMs: number;
  chordSwitchCount: number;
  lastPracticed: number;
  /** expected label -> answered label -> count (mismatches only). */
  confusions: Record<string, Record<string, number>>;
}

export interface SkillSummary {
  skillId: string;
  attempts: number;
  correct: number;
  accuracy: number;
  meanScore: number;
  consistency: number;
  meanReactionMs?: number;
  meanChordSwitchMs?: number;
  lastPracticed: number;
  confusions: Record<string, Record<string, number>>;
}

export interface StatsScope {
  instrument?: Instrument;
  independentOnly?: boolean;
}

/**
 * Whether evidence counts on an instrument: answers on it, and answers recorded with no
 * instrument (a clicked ear answer, scoring rule 2), which belong to their skill whatever is
 * picked. Another instrument's answers never count.
 */
export const onInstrument = (x: { instrument?: Instrument }, instrument?: Instrument) =>
  !instrument || x.instrument === undefined || x.instrument === instrument;

const sliceKey = (skillId: string, instrument: Instrument | undefined, independent: boolean) =>
  `${skillId}|${instrument ?? "-"}|${independent ? "i" : "a"}`;

const emptyStats = (skillId: string): SkillStats => ({
  skillId,
  attempts: 0,
  correct: 0,
  scoreSum: 0,
  scoreSqSum: 0,
  reactionSumMs: 0,
  reactionCount: 0,
  chordSwitchSumMs: 0,
  chordSwitchCount: 0,
  lastPracticed: 0,
  confusions: {},
});

const pcName = (midi: number) => noteName(midi, "sharp", false);

/** Mismatched (expected, answered) pairs from choice and pitch metrics; pitch reduced to pitch class. */
export function confusionPairs(e: ScoringEvent): [string, string][] {
  const pairs: [string, string][] = [];
  for (const m of e.metrics) {
    if (m.kind === "choice" && m.actual !== undefined && m.actual !== m.expected)
      pairs.push([m.expected, m.actual]);
    if (m.kind === "pitch" && m.actualMidi !== undefined) {
      const [a, b] = [pcName(m.expectedMidi), pcName(m.actualMidi)];
      if (a !== b) pairs.push([a, b]);
    }
  }
  return pairs;
}

function addEvent(s: SkillStats, e: ScoringEvent): SkillStats {
  const score = Math.min(1, Math.max(0, e.partialCredit));
  const confusions = { ...s.confusions };
  for (const [exp, act] of confusionPairs(e)) {
    confusions[exp] = { ...confusions[exp], [act]: (confusions[exp]?.[act] ?? 0) + 1 };
  }
  const chord = e.metrics.some((m) => m.kind === "chord");
  const rt = e.latencyMs;
  return {
    ...s,
    attempts: s.attempts + 1,
    correct: s.correct + (e.correct ? 1 : 0),
    scoreSum: s.scoreSum + score,
    scoreSqSum: s.scoreSqSum + score * score,
    reactionSumMs: s.reactionSumMs + (rt ?? 0),
    reactionCount: s.reactionCount + (rt !== undefined ? 1 : 0),
    chordSwitchSumMs: s.chordSwitchSumMs + (chord && rt !== undefined ? rt : 0),
    chordSwitchCount: s.chordSwitchCount + (chord && rt !== undefined ? 1 : 0),
    lastPracticed: Math.max(s.lastPracticed, e.at),
    confusions,
  };
}

/** Incremental and idempotent by event id. */
export function ingestAnalytics(
  stats: Record<string, SkillStats>,
  processed: string[],
  events: ScoringEvent[],
): { stats: Record<string, SkillStats>; processed: string[]; changed: string[] } {
  const seen = new Set(processed);
  const next = { ...stats };
  const changed = new Set<string>();
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const independent = e.assistance === "independent";
    for (const skillId of new Set(e.skillIds)) {
      const key = sliceKey(skillId, e.instrument, independent);
      next[key] = addEvent(
        next[key] ?? { ...emptyStats(skillId), instrument: e.instrument, independent },
        e,
      );
      changed.add(skillId);
    }
  }
  return { stats: next, processed: [...seen], changed: [...changed] };
}

function mergeInto(a: SkillStats, b: SkillStats): SkillStats {
  const confusions = { ...a.confusions };
  for (const [exp, row] of Object.entries(b.confusions)) {
    const merged = { ...confusions[exp] };
    for (const [act, n] of Object.entries(row)) merged[act] = (merged[act] ?? 0) + n;
    confusions[exp] = merged;
  }
  return {
    ...a,
    attempts: a.attempts + b.attempts,
    correct: a.correct + b.correct,
    scoreSum: a.scoreSum + b.scoreSum,
    scoreSqSum: a.scoreSqSum + b.scoreSqSum,
    reactionSumMs: a.reactionSumMs + b.reactionSumMs,
    reactionCount: a.reactionCount + b.reactionCount,
    chordSwitchSumMs: a.chordSwitchSumMs + b.chordSwitchSumMs,
    chordSwitchCount: a.chordSwitchCount + b.chordSwitchCount,
    lastPracticed: Math.max(a.lastPracticed, b.lastPracticed),
    confusions,
  };
}

export function summarize(s: SkillStats): SkillSummary {
  const n = s.attempts;
  const meanScore = n ? s.scoreSum / n : 0;
  const stdev = n ? Math.sqrt(Math.max(0, s.scoreSqSum / n - meanScore * meanScore)) : 0;
  return {
    skillId: s.skillId,
    attempts: n,
    correct: s.correct,
    accuracy: n ? s.correct / n : 0,
    meanScore,
    consistency: Math.max(0, 1 - 2 * stdev),
    meanReactionMs: s.reactionCount ? s.reactionSumMs / s.reactionCount : undefined,
    meanChordSwitchMs: s.chordSwitchCount ? s.chordSwitchSumMs / s.chordSwitchCount : undefined,
    lastPracticed: s.lastPracticed,
    confusions: s.confusions,
  };
}

/** Per-skill summaries within a scope (instrument and/or independent attempts only). */
export function skillSummaries(
  stats: Record<string, SkillStats>,
  scope: StatsScope = {},
): Record<string, SkillSummary> {
  const merged: Record<string, SkillStats> = {};
  for (const s of Object.values(stats)) {
    if (!onInstrument(s, scope.instrument)) continue;
    if (scope.independentOnly && !s.independent) continue;
    merged[s.skillId] = mergeInto(merged[s.skillId] ?? emptyStats(s.skillId), s);
  }
  return Object.fromEntries(Object.entries(merged).map(([id, s]) => [id, summarize(s)]));
}

/** Accuracy, then mean score, then consistency ascending; more attempts first on ties. */
export const rankWeakest = (summaries: SkillSummary[], minAttempts: number) =>
  summaries
    .filter((s) => s.attempts >= minAttempts)
    .sort(
      (a, b) =>
        a.accuracy - b.accuracy ||
        a.meanScore - b.meanScore ||
        a.consistency - b.consistency ||
        b.attempts - a.attempts,
    );

export const weakestSkills = (
  stats: Record<string, SkillStats>,
  opts: StatsScope & { minAttempts: number },
): SkillSummary[] => rankWeakest(Object.values(skillSummaries(stats, opts)), opts.minAttempts);

export interface Confusion {
  skillId: string;
  expected: string;
  actual: string;
  count: number;
}

/** Every confusion across the given summaries, most frequent first. */
export function topConfusions(summaries: Record<string, SkillSummary>): Confusion[] {
  const out: Confusion[] = [];
  for (const s of Object.values(summaries))
    for (const [expected, row] of Object.entries(s.confusions))
      for (const [actual, count] of Object.entries(row))
        out.push({ skillId: s.skillId, expected, actual, count });
  return out.sort((a, b) => b.count - a.count);
}
