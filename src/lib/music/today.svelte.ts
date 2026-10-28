// Today's plan, streak, coach and challenges, derived from the practice store.
// One routine builder (lessons: it once existed three times).
import type { Instrument } from "@repo/music-core";
import { browser } from "$app/environment";
import {
  buildRoutine,
  completedSteps,
  currentPass,
  dayInstrument,
  dueSkills,
  passId,
  pickShelfSong,
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
import { INSTRUMENT_LABEL } from "./bench.svelte";
import { db, settings } from "./runtime";

/** Shelf keys the song block can open: songs in the library with a shelf tag, and downloaded scores. */
let shelfKeys = $state<ReadonlySet<string>>(new Set());
async function loadShelfKeys() {
  const own = (await db.songs.toArray().catch(() => [])) as { shelf?: string }[];
  const res = await fetch("/api/music/scores").catch(() => undefined);
  const downloaded: { key: string }[] = res?.ok ? await res.json().catch(() => []) : [];
  shelfKeys = new Set([
    ...own.flatMap((s) => (s.shelf ? [s.shelf] : [])),
    ...downloaded.map((d) => d.key),
  ]);
}
if (browser) void loadShelfKeys();

function pathPlan(instrument: Instrument) {
  const path = LEARNING_PATHS[PATH_FOR_INSTRUMENT[instrument]];
  const runs = practice.sessions.flatMap((s) => s.runs);
  const progress = pathProgress(path, practice.events, undefined, runs);
  const next = progress.steps.find((s) => s.status === "next")?.step;
  const focus: PathFocus | undefined = next && {
    pathTitle: path.title,
    title: next.title,
    summary: next.summary,
    href: next.href,
    skillIds: next.skillIds,
  };
  return { focus, song: pickShelfSong(progress, shelfKeys) };
}

/** Today's weekday, Monday 0, in local time: the day the weekly split names. */
export const localWeekday = (now = Date.now()) => (new Date(now).getDay() + 6) % 7;

/** The set for today's instrument: the weekly split's for today, else the strip's. */
export function todayPlan(strip: Instrument, minutes: number) {
  const now = Date.now();
  const instrument = dayInstrument(settings.value.weeklySplit, localWeekday(now), strip);
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
  const { focus, song } = pathPlan(instrument);
  const base = `routine-${today}-${instrument}-${budget}`;
  const pass = currentPass(base, practice.sessions);
  const input = {
    instrument,
    budgetMinutes: budget,
    weakSkillIds: weak,
    dueSkillIds: dueSkills(practice.mastery, now),
    pathFocus: focus,
    song,
    day: today,
  };
  const routine = buildRoutine({ ...input, id: passId(base, pass) });
  // Repeat the set opens the next pass, with its own id, so its blocks start not done.
  const repeatHref = buildRoutine({ ...input, id: passId(base, pass + 1) }).steps[0]?.href;
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
  return { today, instrument, pass, routine, repeatHref, done, streak, freezes, advice, summary };
}

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const SPLIT_ORDER: Instrument[] = ["guitar", "ukulele", "piano", "aerophone", "mpc", "voice"];

/** Choices for a weekday in the split: "" plays the strip's instrument. */
export const splitOptions = (strip: Instrument) => [
  { value: "", label: `The strip's (${INSTRUMENT_LABEL[strip].toLowerCase()})` },
  ...SPLIT_ORDER.map((i) => ({ value: i, label: INSTRUMENT_LABEL[i] })),
];

export function setDayInstrument(weekday: number, value: string) {
  const split = Array.from({ length: 7 }, (_, i) => settings.value.weeklySplit?.[i] ?? null);
  split[weekday] = (value || null) as Instrument | null;
  return settings.update({ weeklySplit: split });
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
