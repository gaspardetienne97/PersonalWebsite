// XP, level, forgiving streak with freezes, achievements, daily challenges (catalog 5.6).
// XP and streaks reward showing up; they never touch mastery.
import type { Capability, PracticeSession, ScoringEvent, SkillMastery } from "../types";
import { clamp01 } from "../theory/notes";
import { DAY_MS } from "./mastery";
import { m } from "@repo/i18n/messages.js";

/** Decision in TASKS.md: a wrong answer earns 5, a perfect hard answer 60 plus improvement. */
export const xpForAttempt = (partialCredit: number, difficulty: number, improvement: number) => {
  const p = clamp01(partialCredit);
  return Math.round(5 + p * 35 + clamp01(difficulty) * p * 20 + clamp01(improvement) * 25);
};

/** Best gain over the previous score of any skill the attempt touches (0 with no history). */
export function improvementFor(
  skillIds: string[],
  score: number,
  previousBySkill: Record<string, number>,
): number {
  const gains = skillIds
    .filter((id) => id in previousBySkill)
    .map((id) => score - previousBySkill[id]);
  return clamp01(Math.max(0, ...gains));
}

export const levelFor = (xp: number) => Math.max(1, Math.floor(xp / 250) + 1);

// ---------------------------------------------------------------------------
// Day keys: the calendar day on the player's own clock, so a day ends at their
// midnight, not at midnight UTC. Arithmetic on a key is plain calendar math
// (done in UTC, where every day is 24 hours long).

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`);
export const addDays = (day: string, n: number) =>
  new Date(dayStart(day) + n * DAY_MS).toISOString().slice(0, 10);
/** Monday of the ISO week containing `day`: one key per ISO week. */
export const weekStart = (day: string) =>
  addDays(day, -((new Date(dayStart(day)).getUTCDay() + 6) % 7));

export const practicedDays = (sessions: PracticeSession[]) => [
  ...new Set(
    sessions.filter((s) => s.runs.length || s.eventIds.length).map((s) => dayKey(s.startTime)),
  ),
];

// ---------------------------------------------------------------------------
// Streak

export type DotState = "practised" | "frozen" | "missed" | "today" | "upcoming";

export interface Streak {
  /** Practised days in the unbroken chain ending today (or yesterday); frozen days bridge but do not count. */
  current: number;
  longest: number;
  /** The ISO week holding today, Monday to Sunday, as the minutes chart shows it. */
  week: { day: string; state: DotState }[];
  /** Uncovered days between the last practised or frozen day and today: what a freeze would cover. */
  gap: string[];
}

export function computeStreak(practiced: string[], frozen: string[], today: string): Streak {
  const P = new Set(practiced);
  const F = new Set(frozen);
  const covered = (d: string) => P.has(d) || F.has(d);

  let current = 0;
  for (let d = P.has(today) ? today : addDays(today, -1); covered(d); d = addDays(d, -1))
    if (P.has(d)) current++;

  let longest = 0;
  let run = 0;
  let prev = "";
  for (const d of [...new Set([...P, ...F])].sort()) {
    run = prev && addDays(prev, 1) === d ? run : 0;
    if (P.has(d)) run++;
    longest = Math.max(longest, run);
    prev = d;
  }

  const lastCovered = [...P, ...F]
    .filter((d) => d < today)
    .sort()
    .at(-1);
  const gap: string[] = [];
  if (lastCovered) for (let d = addDays(lastCovered, 1); d < today; d = addDays(d, 1)) gap.push(d);

  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(weekStart(today), i);
    const state: DotState = P.has(day)
      ? "practised"
      : F.has(day)
        ? "frozen"
        : day === today
          ? "today"
          : day > today
            ? "upcoming"
            : "missed";
    return { day, state };
  });

  return { current, longest, week, gap };
}

export const FREEZE_CAP = 2;

/**
 * Freezes held now, replayed in day order: the first practised day of each ISO week grants one
 * (cap 2), each frozen day spends one.
 */
export function freezesEarned(practiced: string[], frozen: string[]): number {
  const P = new Set(practiced);
  const F = new Set(frozen);
  const granted = new Set<string>();
  let held = 0;
  for (const d of [...new Set([...P, ...F])].sort()) {
    if (F.has(d)) held = Math.max(0, held - 1);
    if (P.has(d) && !granted.has(weekStart(d))) {
      granted.add(weekStart(d));
      held = Math.min(FREEZE_CAP, held + 1);
    }
  }
  return held;
}

/** On a practised day after a gap no longer than the freezes held, freeze the gap. */
export function applyFreezes(
  practiced: string[],
  frozen: string[],
  today: string,
): { frozenDays: string[]; used: number } {
  if (!practiced.includes(today)) return { frozenDays: frozen, used: 0 };
  const { gap } = computeStreak(practiced, frozen, today);
  const held = freezesEarned(
    practiced.filter((d) => d < today),
    frozen,
  );
  if (gap.length === 0 || gap.length > held) return { frozenDays: frozen, used: 0 };
  return { frozenDays: [...frozen, ...gap].sort(), used: gap.length };
}

// ---------------------------------------------------------------------------
// Achievements

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
}

export function achievements(input: {
  xp: number;
  longestStreak: number;
  mastery: Record<string, SkillMastery>;
  frozenDays: string[];
}): Achievement[] {
  const peak = Math.max(0, ...Object.values(input.mastery).map((m) => m.lastMeasured ?? m.mastery));
  return [
    {
      id: "first-100-xp",
      title: m.music_cards_ach_100_title(),
      description: m.music_cards_ach_100_text(),
      unlocked: input.xp >= 100,
    },
    {
      id: "level-5",
      title: m.music_cards_ach_level5_title(),
      description: m.music_cards_ach_level5_text(),
      unlocked: levelFor(input.xp) >= 5,
    },
    {
      id: "seven-day-streak",
      title: m.music_cards_ach_streak_title(),
      description: m.music_cards_ach_streak_text(),
      unlocked: input.longestStreak >= 7,
    },
    {
      id: "first-skill-50",
      title: m.music_cards_ach_half_title(),
      description: m.music_cards_ach_half_text(),
      unlocked: peak >= 0.5,
    },
    {
      id: "first-skill-mastered",
      title: m.music_cards_ach_mastered_title(),
      description: m.music_cards_ach_mastered_text(),
      unlocked: peak >= 0.8,
    },
    {
      id: "first-freeze-save",
      title: m.music_cards_ach_freeze_title(),
      description: m.music_cards_ach_freeze_text(),
      unlocked: input.frozenDays.length > 0,
    },
  ];
}

// ---------------------------------------------------------------------------
// Daily challenges and the weekly summary

export interface WeakSpot {
  skillId: string;
  name: string;
  href: string;
}

export interface Challenge {
  id: "daily-xp" | "weak-spot-reps" | "capability-variety" | "keep-streak";
  title: string;
  description: string;
  href?: string;
  target: number;
  progress: number;
  done: boolean;
}

const challenge = (c: Omit<Challenge, "done">): Challenge => ({
  ...c,
  progress: Math.min(c.progress, c.target),
  done: c.progress >= c.target,
});

/**
 * The four daily challenges for `day`. With no weak spot yet (the coach has not measured
 * enough), the reps challenge counts any three checked attempts instead.
 */
export function dailyChallenges(input: {
  day: string;
  sessions: PracticeSession[];
  events: ScoringEvent[];
  weakSpot?: WeakSpot;
}): Challenge[] {
  const { day, weakSpot } = input;
  const sessions = input.sessions.filter((s) => dayKey(s.startTime) === day);
  const events = input.events.filter((e) => dayKey(e.at) === day);
  const capabilities = new Set<Capability>(events.flatMap((e) => e.capabilities));
  return [
    challenge({
      id: "daily-xp",
      title: m.music_cards_ch_xp_title(),
      description: m.music_cards_ch_xp_text(),
      href: "/music",
      target: 100,
      progress: sessions.reduce((sum, s) => sum + s.xp, 0),
    }),
    weakSpot
      ? challenge({
          id: "weak-spot-reps",
          title: weakSpot.name,
          description: m.music_cards_ch_weak_text(),
          href: weakSpot.href,
          target: 3,
          progress: events.filter((e) => e.skillIds.includes(weakSpot.skillId)).length,
        })
      : challenge({
          id: "weak-spot-reps",
          title: m.music_cards_ch_check_title(),
          description: m.music_cards_ch_check_text(),
          href: "/music",
          target: 3,
          progress: events.filter((e) => e.assistance === "independent").length,
        }),
    challenge({
      id: "capability-variety",
      title: m.music_cards_ch_variety_title(),
      description: m.music_cards_ch_variety_text(),
      href: "/music",
      target: 2,
      progress: capabilities.size,
    }),
    challenge({
      id: "keep-streak",
      title: m.music_cards_ch_streak_title(),
      description: m.music_cards_ch_streak_text(),
      target: 1,
      progress: sessions.some((s) => s.runs.length || s.eventIds.length) ? 1 : 0,
    }),
  ];
}

/** XP, sessions and challenges completed this ISO week, Monday through `today`. */
export function weeklySummary(input: {
  today: string;
  sessions: PracticeSession[];
  events: ScoringEvent[];
  weakSpot?: WeakSpot;
}): { weekStart: string; xp: number; sessions: number; completedChallenges: number } {
  const start = weekStart(input.today);
  const inWeek = input.sessions.filter((s) => {
    const d = dayKey(s.startTime);
    return d >= start && d <= input.today;
  });
  let completedChallenges = 0;
  for (let d = start; d <= input.today; d = addDays(d, 1))
    completedChallenges += dailyChallenges({ ...input, day: d }).filter((c) => c.done).length;
  return {
    weekStart: start,
    xp: inWeek.reduce((sum, s) => sum + s.xp, 0),
    sessions: inWeek.length,
    completedChallenges,
  };
}
