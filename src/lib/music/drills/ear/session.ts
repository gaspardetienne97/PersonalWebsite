// Ear sessions: which prompts a 10-prompt run asks, in what order and at what
// difficulty. The scheduler decides priority (balanced per drill, adaptive for
// the mixed review); this file maps its skills back to prompts.
import {
  cadencePrompt,
  chordQualityPrompt,
  degreeLabel,
  EAR_INTERVALS,
  EAR_SESSION_LENGTH,
  type IntervalDirection,
  intervalComparePrompt,
  intervalPrompt,
  melodyDictationPrompt,
  type CompareGap,
  SCALE_DEGREE_LEVELS,
  SCALE_DEGREES,
  scaleDegreePrompt,
  type EarPrompt,
} from "@repo/music-core/content/ear";
import { CADENCES_AND_QUALITIES } from "@repo/music-core/data/index";
import { INTERVALS } from "@repo/music-core/theory/intervals";
import type { Rand } from "@repo/music-core/content/random";
import type { ScoringEvent, SkillMastery } from "@repo/music-core";
import {
  ingestAnalytics,
  skillSummaries,
  type SkillSummary,
} from "@repo/music-core/progress/analytics";
import {
  buildQueue,
  EAR_DRILLS,
  orderEarQueue,
  retrySchedule,
} from "@repo/music-core/progress/scheduler";

export type EarKind =
  | "interval"
  | "interval-compare"
  | "chord-quality"
  | "cadence"
  | "scale-degree"
  | "melody-dictation";
export type LabelMode = "degree" | "solfege";

/** Difficulty for a skill nobody has practised yet (intervals stay ascending below 0.4). */
export const FRESH_DIFFICULTY = 0.3;
/** Seventh chords are only offered from difficulty 0.65 up. */
const SEVENTH_FLOOR = 0.65;

export interface EarTarget {
  kind: EarKind;
  token: string;
  skillId: string;
}

const QUALITIES = CADENCES_AND_QUALITIES.chordQualities;
const CADENCES = CADENCES_AND_QUALITIES.cadences;

export const levelDegrees = (level: string) =>
  (SCALE_DEGREE_LEVELS.find((l) => l.id === level) ?? SCALE_DEGREE_LEVELS[0]).degrees as string[];

function shuffle<T>(xs: T[], rand: Rand): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** What the interval drill is narrowed to: some intervals, one direction. */
export interface IntervalFocus {
  /** Interval tokens to ask (P1 to P8); empty or missing: the twelve m2 to P8. */
  intervals?: string[];
  direction?: IntervalDirection;
  /** Fixed first note (MIDI), so only the distance changes. */
  root?: number;
  /** Past accuracy (0..1) per interval token: weaker intervals are asked more. */
  accuracy?: Record<string, number>;
}

/** How much more often an interval is asked: 1 when always right, up to 4 when always wrong; 2 when untried. */
export const weaknessWeight = (acc: number | undefined) =>
  acc === undefined ? 2 : 1 + 3 * (1 - acc);

const focusIntervals = (f?: IntervalFocus) =>
  f?.intervals?.length ? EAR_INTERVALS.filter((i) => f.intervals!.includes(i.token)) : INTERVALS;

/** Every answerable target of one drill kind. */
export function targetsFor(kind: EarKind, level: string, focus?: IntervalFocus): EarTarget[] {
  switch (kind) {
    case "interval":
      return focusIntervals(focus).map((i) => ({
        kind,
        token: i.token,
        // The unison has no skill of its own; it trains the general one.
        skillId: i.token === "P1" ? "pitch.intervals" : `pitch.interval.${i.token}`,
      }));
    case "interval-compare":
      // By how far apart the two intervals are; all train the one interval skill.
      return (["apart", "near", "close"] as const).map((gap) => ({
        kind,
        token: gap,
        skillId: "pitch.intervals",
      }));
    case "chord-quality":
      return QUALITIES.map((q) => ({ kind, token: q.token, skillId: q.skillId }));
    case "cadence":
      return CADENCES.map((c) => ({ kind, token: c.token, skillId: c.skillId }));
    case "scale-degree":
    case "melody-dictation":
      return levelDegrees(level).map((d) => ({
        kind,
        token: d,
        skillId: `pitch.scale-degree.${d}`,
      }));
  }
}

export function promptFor(
  t: EarTarget,
  difficulty: number,
  level: string,
  rand: Rand,
  focus?: IntervalFocus,
): EarPrompt {
  switch (t.kind) {
    case "interval": {
      // The answer buttons are the intervals being practised (with two or more of them).
      const picked = focusIntervals(focus);
      return intervalPrompt(rand, {
        difficulty,
        token: t.token,
        direction: focus?.direction,
        root: focus?.root,
        // One interval alone: every interval is a possible answer (with the unison, when it is the one).
        choices: !focus?.intervals
          ? undefined
          : picked.length >= 2
            ? picked.map((i) => i.token)
            : picked[0]?.token === "P1"
              ? EAR_INTERVALS.map((i) => i.token)
              : undefined,
      });
    }
    case "interval-compare":
      return intervalComparePrompt(rand, { difficulty, gap: t.token as CompareGap });
    case "chord-quality": {
      const seventh = QUALITIES.find((q) => q.token === t.token)?.level === "seventh";
      return chordQualityPrompt(rand, {
        difficulty: seventh ? Math.max(difficulty, SEVENTH_FLOOR) : difficulty,
        token: t.token,
      });
    }
    case "cadence":
      return cadencePrompt(rand, { difficulty, token: t.token });
    case "scale-degree":
      return scaleDegreePrompt(rand, { difficulty, level, degree: t.token });
    case "melody-dictation":
      return melodyDictationPrompt(rand, { difficulty, level, degree: t.token });
  }
}

export interface SessionInput {
  kinds: EarKind[];
  level: string;
  mode: "balanced" | "adaptive";
  mastery: Record<string, SkillMastery>;
  summaries: Record<string, SkillSummary>;
  now: number;
  rand: Rand;
  length?: number;
  focus?: IntervalFocus;
}

/**
 * Priority order from the scheduler, cycled to fill the session. Balanced keeps the
 * scheduler's round-robin (or plain priority for one drill); adaptive never asks the
 * same drill twice in a row. Difficulty is `presentedDifficulty` once a skill has mastery.
 */
export function buildSession(inp: SessionInput): EarPrompt[] {
  const length = inp.length ?? EAR_SESSION_LENGTH;
  // Shuffled so equal priorities (a fresh start) don't always run in table order.
  const targets = shuffle(
    inp.kinds.flatMap((k) => targetsFor(k, inp.level, inp.focus)),
    inp.rand,
  );
  const byId = new Map(targets.map((t) => [`${t.kind}:${t.token}`, t]));
  const queue = buildQueue(
    targets.map((t) => ({ id: `${t.kind}:${t.token}`, skillIds: [t.skillId], drill: t.kind })),
    inp.mastery,
    inp.summaries,
    inp.now,
  );
  const allEar = inp.kinds.every((k) => (EAR_DRILLS as readonly string[]).includes(k));
  let ordered = allEar && inp.kinds.length > 1 ? orderEarQueue(queue, inp.mode) : queue;
  // Locked skills drop out of the queue; never leave a session empty.
  if (ordered.length === 0) ordered = queue.length ? queue : [];
  const items = ordered.length
    ? ordered.map((q) => ({
        target: byId.get(q.exerciseId)!,
        difficulty: inp.mastery[q.skillId] ? q.difficulty : FRESH_DIFFICULTY,
      }))
    : targets.map((t) => ({ target: t, difficulty: FRESH_DIFFICULTY }));

  const out: EarPrompt[] = [];
  // Intervals with a track record: every one once, then the rest drawn by weakness.
  if (
    inp.focus?.accuracy &&
    inp.kinds.length === 1 &&
    inp.kinds[0] === "interval" &&
    items.length > 1
  ) {
    const acc = inp.focus.accuracy;
    const weightOf = (it: (typeof items)[number]) => weaknessWeight(acc[it.target.token]);
    const pickWeighted = (avoid?: string) => {
      const pool = items.filter((it) => it.target.token !== avoid);
      let r = inp.rand() * pool.reduce((t, it) => t + weightOf(it), 0);
      for (const it of pool) if ((r -= weightOf(it)) <= 0) return it;
      return pool[pool.length - 1];
    };
    for (const it of shuffle(items, inp.rand).slice(0, length))
      out.push(promptFor(it.target, it.difficulty, inp.level, inp.rand, inp.focus));
    while (out.length < length) {
      const it = pickWeighted(out.at(-1)?.answer);
      out.push(promptFor(it.target, it.difficulty, inp.level, inp.rand, inp.focus));
    }
    return out;
  }
  let i = 0;
  while (out.length < length && items.length) {
    const it = items[i % items.length];
    const prev = out.at(-1);
    const repeat =
      prev &&
      items.length > 1 &&
      (inp.mode === "adaptive" && inp.kinds.length > 1
        ? prev.drill === it.target.kind
        : prev.answer === it.target.token);
    if (!repeat || i > items.length * 3)
      out.push(promptFor(it.target, it.difficulty, inp.level, inp.rand, inp.focus));
    i++;
  }
  return out;
}

/** The target a skill id names, when it names exactly one answer. */
export function targetForSkill(
  skillId: string,
  kinds: EarKind[],
  level: string,
): EarTarget | undefined {
  for (const k of kinds) {
    const hit = targetsFor(
      k,
      k === "scale-degree" || k === "melody-dictation" ? "full-current" : level,
    ).find((t) => t.skillId === skillId);
    if (hit) return hit;
  }
  return undefined;
}

/** "Retry my confusions": the scheduler's retry list, one prompt per confused answer, at its difficulty. */
export function retryPrompts(events: ScoringEvent[], kinds: EarKind[], rand: Rand): EarPrompt[] {
  const { stats } = ingestAnalytics({}, [], events);
  const items = retrySchedule(skillSummaries(stats));
  const seen = new Set<string>();
  const out: EarPrompt[] = [];
  for (const it of items) {
    const t = targetForSkill(it.skillId, kinds, "full-current");
    if (!t || seen.has(`${t.kind}:${t.token}`)) continue;
    seen.add(`${t.kind}:${t.token}`);
    out.push(promptFor(t, it.difficulty, "full-current", rand));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Labels

export const KIND_LABEL: Record<EarKind, string> = {
  interval: "Intervals",
  "interval-compare": "Interval comparison",
  "chord-quality": "Chord qualities",
  cadence: "Cadences",
  "scale-degree": "Scale degrees",
  "melody-dictation": "Melody dictation",
};

export function tokenLabel(
  kind: EarKind | string,
  token: string,
  labels: LabelMode = "degree",
): string {
  if (kind === "interval") return EAR_INTERVALS.find((i) => i.token === token)?.name ?? token;
  if (kind === "interval-compare")
    return token === "first"
      ? "The first is bigger"
      : token === "second"
        ? "The second is bigger"
        : "They are the same size";
  if (kind === "chord-quality") return QUALITIES.find((q) => q.token === token)?.label ?? token;
  if (kind === "cadence") {
    const c = CADENCES.find((x) => x.token === token);
    return c ? `${c.label} (${c.romanProgression.join(" to ")})` : token;
  }
  if (kind === "scale-degree" && SCALE_DEGREES.some((d) => d.label === token))
    return degreeLabel(token, labels);
  if (kind === "melody-dictation" || kind === "repertoire-transfer")
    return token
      .split(" ")
      .map((d) => (SCALE_DEGREES.some((x) => x.label === d) ? degreeLabel(d, labels) : d))
      .join(", ");
  return token;
}

/** Short label for confusion rows ("m6", "3 / mi", "Plagal"). */
export function shortLabel(kind: EarKind | string, token: string, labels: LabelMode = "degree") {
  if (kind === "interval") return token;
  if (kind === "interval-compare")
    return token === "same" ? "Same" : token === "first" ? "First" : "Second";
  if (kind === "cadence") return CADENCES.find((x) => x.token === token)?.label ?? token;
  return tokenLabel(kind, token, labels);
}

// ---------------------------------------------------------------------------
// Session summary

export interface AnswerRecord {
  kind: EarKind | "repertoire-transfer";
  expected: string;
  answered?: string;
  correct: boolean;
  scored: boolean;
}

export function perKind(records: AnswerRecord[]) {
  const out = new Map<string, { total: number; correct: number }>();
  for (const r of records.filter((x) => x.scored)) {
    const e = out.get(r.kind) ?? { total: 0, correct: 0 };
    e.total++;
    if (r.correct) e.correct++;
    out.set(r.kind, e);
  }
  return [...out].map(([kind, v]) => ({ kind, ...v }));
}

/** "expected m6, answered P5" with counts, most frequent first. */
export function confusions(records: AnswerRecord[]) {
  const counts = new Map<
    string,
    { kind: string; expected: string; answered: string; count: number }
  >();
  for (const r of records) {
    if (!r.scored || r.correct || !r.answered || r.answered === r.expected) continue;
    const k = `${r.kind}|${r.expected}|${r.answered}`;
    const e = counts.get(k) ?? {
      kind: r.kind,
      expected: r.expected,
      answered: r.answered,
      count: 0,
    };
    e.count++;
    counts.set(k, e);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}
