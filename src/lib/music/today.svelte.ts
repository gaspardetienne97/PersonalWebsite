// Today's plan, streak, coach and challenges, derived from the practice store.
// One routine builder (lessons: it once existed three times).
import type { Instrument } from "@repo/music-core";
import {
  buildRoutine,
  completedSteps,
  dueSkills,
  routineSummary,
  snapBudget,
  type PathFocus,
  type RoutineStep,
} from "@repo/music-core/progress/routine";
import { skillName } from "@repo/music-core/progress/graph";
import { LEARNING_PATHS, PATH_FOR_INSTRUMENT, pathProgress } from "@repo/music-core/progress/paths";
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

function pathFocus(instrument: Instrument): PathFocus | undefined {
  const path = LEARNING_PATHS[PATH_FOR_INSTRUMENT[instrument]];
  const runs = practice.sessions.flatMap((s) => s.runs);
  const next = pathProgress(path, practice.events, undefined, runs).steps.find(
    (s) => s.status === "next",
  )?.step;
  return (
    next && {
      pathTitle: path.title,
      title: next.title,
      summary: next.summary,
      href: next.href,
      skillIds: next.skillIds,
    }
  );
}

export function todayPlan(instrument: Instrument, minutes: number) {
  const now = Date.now();
  const budget = snapBudget(minutes);
  const today = dayKey(now);
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
    dueSkillIds: dueSkills(practice.mastery, now),
    pathFocus: pathFocus(instrument),
    day: today,
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
    now,
  });
  const summary = routineSummary(routine, practice.sessions, practice.events);
  return { today, routine, done, streak, freezes, advice, summary };
}

/** The line under a block: why it is in the set. */
export function blockReason(step: RoutineStep): string {
  if (step.reason === "due" && step.skillId) return `Due for review: ${skillName(step.skillId)}.`;
  if (step.reason === "weak-spot" && step.skillId)
    return `Your weak spot: ${skillName(step.skillId)}.`;
  return step.description;
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
