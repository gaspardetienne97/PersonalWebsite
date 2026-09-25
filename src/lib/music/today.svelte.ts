// Today's plan, streak, coach and challenges, derived from the practice store.
// One routine builder (lessons: it once existed three times).
import type { Instrument } from "@repo/music-core";
import { buildRoutine, completedSteps, routineSummary } from "@repo/music-core/progress/routine";
import { coach } from "@repo/music-core/progress/coach";
import {
  computeStreak,
  dailyChallenges,
  dayKey,
  freezesEarned,
  practicedDays,
} from "@repo/music-core/progress/rewards";
import { weakestSkills } from "@repo/music-core/progress/analytics";
import { COACH_MIN_ATTEMPTS } from "@repo/music-core/progress/coach";
import { practice } from "./practice.svelte";
import { settings } from "./runtime";

export function todayPlan(instrument: Instrument, budget: number) {
  const today = dayKey(Date.now());
  const independentAttempts = Object.values(practice.stats)
    .filter((s) => s.instrument === instrument && s.independent)
    .reduce((n, s) => n + s.attempts, 0);
  const weak =
    independentAttempts >= COACH_MIN_ATTEMPTS
      ? weakestSkills(practice.stats, { instrument, independentOnly: true, minAttempts: 3 })
          .slice(0, 2)
          .map((s) => s.skillId)
      : [];
  const routine = buildRoutine({
    id: `routine-${today}-${instrument}-${budget}`,
    instrument,
    budgetMinutes: budget,
    weakSkillIds: weak,
  });
  const done = completedSteps(routine, practice.sessions);
  const days = practicedDays(practice.sessions);
  const streak = computeStreak(days, settings.value.frozenDays, today);
  const freezes = freezesEarned(days, settings.value.frozenDays);
  const advice = coach({
    instrument,
    stats: practice.stats,
    mastery: practice.mastery,
    sessions: practice.sessions,
    streak: streak.current,
    now: Date.now(),
  });
  const summary = routineSummary(routine, practice.sessions, practice.events);
  return { today, routine, done, streak, freezes, advice, summary };
}

export function todayChallenges(advice: ReturnType<typeof coach>) {
  return dailyChallenges({
    day: dayKey(Date.now()),
    sessions: practice.sessions,
    events: practice.events,
    weakSpot: advice.focus
      ? { skillId: advice.focus.skillId, name: advice.focus.name, href: advice.action.href }
      : undefined,
  });
}
