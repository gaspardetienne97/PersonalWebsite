// Pure projections behind the Progress and Journal pages. Views pass in the
// practice store's state, so the same functions back the tests.
import type {
  Assistance,
  InputSource,
  Instrument,
  Label,
  PracticeSession,
  SessionSource,
  Skill,
  SkillMastery,
} from "@repo/music-core";
import {
  SKILL_GRAPH,
  aggregateMastery,
  componentChildren,
  isUnlocked,
  skillName,
} from "@repo/music-core/progress/graph";
import { decayMastery, isDueForReview } from "@repo/music-core/progress/mastery";
import { skillSummaries, type SkillStats } from "@repo/music-core/progress/analytics";
import { STEPS, stepForSkill } from "@repo/music-core/progress/routine";
import { COACH_MIN_ATTEMPTS } from "@repo/music-core/progress/coach";
import { addDays, dayKey, weekStart } from "@repo/music-core/progress/rewards";
import { sessionMinutes } from "@repo/music-core/progress/journal";

/** Checked attempts a skill needs before its estimate gets a verdict (same bar as the coach). */
export const MIN_EVIDENCE = COACH_MIN_ATTEMPTS;
export const PICKS_CAP = 8;

export const ASSISTANCE_LABEL: Record<Assistance, string> = {
  independent: "Checked",
  guided: "Practice",
  hinted: "With a hint",
  "self-assessed": "Self-rated",
};

export const INPUT_LABEL: Record<InputSource | "mixed", string> = {
  midi: "MIDI",
  audio: "Microphone",
  onscreen: "On screen",
  click: "Answer buttons",
  mixed: "Mixed input",
};

export const SOURCE_LABEL: Record<SessionSource, string> = {
  "free-practice": "Free practice",
  "daily-routine": "Today's set",
  song: "Song",
  drill: "Drill",
  jam: "Jam",
};

export const CAPABILITY_LABEL = {
  pitch: "Pitch",
  rhythm: "Rhythm",
  harmony: "Harmony",
  reading: "Reading",
  technique: "Technique",
  ear: "Ear",
} as const;

export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const plural = (n: number, word: string, many = `${word}s`) =>
  `${n} ${n === 1 ? word : many}`;
/** Signed change with a real minus sign; "no change" at zero. */
export const signed = (n: number, unit = "") =>
  n === 0 ? "no change" : `${n > 0 ? "+" : "−"}${Math.abs(n)}${unit}`;

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
/** "today", "yesterday", "3 days ago", "2 weeks ago" by local calendar day. */
export function relativeDay(ms: number, now: number): string {
  const day = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  };
  const days = Math.round(day(now) - day(ms));
  if (days < 14) return rtf.format(-days, "day");
  if (days < 60) return rtf.format(-Math.floor(days / 7), "week");
  return rtf.format(-Math.floor(days / 30), "month");
}

export const formatLabel = (l: Label | undefined) =>
  l === undefined ? "" : Array.isArray(l) ? l.join(", ") : String(l);

/** "ear.chord-quality" -> "Ear chord quality" until drills register display names. */
export const exerciseTitle = (id: string) => {
  const s = id.replace(/[._-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Stats slices for one instrument. Attempts recorded with no instrument (answer buttons,
 * mixed runs) count everywhere, so an ear drill still shows under piano.
 */
export function scopedStats(
  stats: Record<string, SkillStats>,
  instrument?: Instrument,
): Record<string, SkillStats> {
  if (!instrument) return stats;
  return Object.fromEntries(
    Object.entries(stats).filter(
      ([, s]) => s.instrument === undefined || s.instrument === instrument,
    ),
  );
}

export interface SkillRow {
  skill: Skill;
  /** Decayed estimate today (0..1); undefined with no mastery evidence. */
  estimate?: number;
  lastMeasured?: number;
  confidence: number;
  due: boolean;
  /** All attempts in scope, and the checked (independent) ones. */
  attempts: number;
  checked: number;
  accuracy?: number;
  lastPracticed?: number;
  unlocked: boolean;
  touched: boolean;
  /** Attempts landed on this skill directly (umbrella skills are only aggregated). */
  direct: boolean;
  /** Has component skills; its estimate is the mean of its parts. */
  umbrella: boolean;
  href: string;
}

export function practiceHref(skillId: string, instrument?: Instrument) {
  const step = stepForSkill(skillId);
  if (!step) return "/music?tab=drills";
  return instrument ? `${STEPS[step].route}?instrument=${instrument}` : STEPS[step].route;
}

export function skillRows(input: {
  stats: Record<string, SkillStats>;
  mastery: Record<string, SkillMastery>;
  instrument?: Instrument;
  now: number;
}): SkillRow[] {
  const { mastery, instrument, now } = input;
  const scoped = scopedStats(input.stats, instrument);
  const all = skillSummaries(scoped);
  const checked = skillSummaries(scoped, { independentOnly: true });
  return SKILL_GRAPH.skills
    .filter((s) => !s.deprecated)
    .map((skill) => {
      const id = skill.id;
      const umbrella = componentChildren(id, SKILL_GRAPH).length > 0;
      // An umbrella with no touched parts but its own evidence falls back to that evidence.
      const parts = aggregateMastery(id, mastery, SKILL_GRAPH, now);
      const own = umbrella && !parts && mastery[id] ? mastery[id] : undefined;
      const agg = parts ?? (own ? decayMastery(own, now) : undefined);
      const leaf = umbrella ? own : mastery[id];
      const sum = all[id];
      const attempts = sum?.attempts ?? 0;
      const touchedChildren =
        umbrella &&
        !!agg &&
        (!instrument || componentChildren(id, SKILL_GRAPH).some((c) => all[c]));
      return {
        skill,
        estimate: agg?.mastery,
        lastMeasured: leaf?.lastMeasured,
        confidence: agg?.confidence ?? 0,
        due: leaf ? isDueForReview(leaf, now) : false,
        attempts,
        // Umbrellas count the checked evidence of their parts (mastery observations).
        checked: umbrella && !attempts ? (agg?.observations ?? 0) : (checked[id]?.attempts ?? 0),
        accuracy: sum ? sum.accuracy : undefined,
        lastPracticed: sum?.lastPracticed || agg?.lastPracticed,
        unlocked: isUnlocked(id, mastery, SKILL_GRAPH, now),
        touched: attempts > 0 || touchedChildren || (!instrument && !!leaf),
        direct: attempts > 0,
        umbrella,
        href: practiceHref(id, instrument),
      };
    });
}

/**
 * What next: measured skills (5+ checked attempts) ranked by the decayed estimate, capped at 8,
 * split into falling (due for review) and holding; everything else touched is not measured yet.
 */
export function nextBuckets(rows: SkillRow[]) {
  const measured = rows
    .filter((r) => r.direct && r.checked >= MIN_EVIDENCE && r.estimate !== undefined)
    .sort((a, b) => a.estimate! - b.estimate!)
    .slice(0, PICKS_CAP);
  const unmeasured = rows
    .filter((r) => r.direct && r.checked < MIN_EVIDENCE)
    .sort((a, b) => (b.lastPracticed ?? 0) - (a.lastPracticed ?? 0));
  return {
    falling: measured.filter((r) => r.due),
    holding: measured.filter((r) => !r.due),
    unmeasured,
  };
}

/** Minutes per day for the ISO week (Monday first) containing `today`. */
export function weekMinutes(sessions: PracticeSession[], today: string) {
  const start = weekStart(today);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start, i);
    const minutes = Math.round(
      sessions
        .filter((s) => dayKey(s.startTime) === day)
        .reduce((n, s) => n + sessionMinutes(s), 0),
    );
    return { day, minutes, future: day > today, today: day === today };
  });
}

export interface SetupTrend {
  key: string;
  title: string;
  detail: string;
  scores: number[];
  first: number;
  last: number;
  best: number;
  lastAt: number;
}

/** Setups (exercise + setup key) with two or more scored runs, most recent first. */
export function setupTrends(sessions: PracticeSession[]): SetupTrend[] {
  const groups = new Map<string, PracticeSession["runs"]>();
  for (const r of sessions.flatMap((s) => s.runs)) {
    if (r.score === undefined) continue;
    const key = `${r.exerciseId}|${r.setupKey}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups]
    .filter(([, runs]) => runs.length >= 2)
    .map(([key, runs]) => {
      const sorted = [...runs].sort((a, b) => a.endedAt - b.endedAt);
      const scores = sorted.map((r) => r.score!);
      const r0 = sorted[0];
      const bpm = r0.params.bpm;
      const parts = [
        r0.skillIds[0] ? skillName(r0.skillIds[0]) : "",
        bpm ? `${bpm} BPM` : "",
        ASSISTANCE_LABEL[r0.assistance],
      ].filter(Boolean);
      return {
        key,
        title: exerciseTitle(r0.exerciseId),
        detail: parts.join(", "),
        scores,
        first: scores[0],
        last: scores.at(-1)!,
        best: Math.max(...scores),
        lastAt: sorted.at(-1)!.endedAt,
      };
    })
    .sort((a, b) => b.lastAt - a.lastAt);
}

export const parseTags = (raw: string) => [
  ...new Set(
    raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  ),
];
