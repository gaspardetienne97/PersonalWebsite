// Today's plan, streak, coach and challenges, derived from the practice store.
// One routine builder (lessons: it once existed three times).
import type { Instrument } from "@repo/music-core";
import { browser } from "$app/env";
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
import { LEARNING_PATHS, PATH_FOR_INSTRUMENT, pathProgress } from "@repo/music-core/progress/paths";
import { coach, practiceName } from "@repo/music-core/progress/coach";
import {
  computeStreak,
  dailyChallenges,
  dayKey,
  freezesEarned,
  practicedDays,
} from "@repo/music-core/progress/rewards";
import { onInstrument, weakestSkills } from "@repo/music-core/progress/analytics";
import { practice } from "./practice.svelte";
import { INSTRUMENT_LABEL } from "./bench.svelte";
import { db, settings } from "./runtime";
import { plainPathText } from "./hubs/progress/model";
import { CATALOG } from "@repo/music-core/content/catalog";
import { m } from "@repo/i18n/messages.js";

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

/** The set for today's instrument: the weekly split's for today, else the strip's. `now` a day ahead gives tomorrow's. */
export function todayPlan(strip: Instrument, minutes: number, now = Date.now()) {
  const instrument = dayInstrument(settings.value.weeklySplit, localWeekday(now), strip);
  const budget = snapBudget(minutes);
  const today = dayKey(now);
  const { focus, song } = pathPlan(instrument);
  const base = `routine-${today}-${instrument}-${budget}`;
  const pass = currentPass(base, practice.sessions);
  const days = practicedDays(practice.sessions);
  const streak = computeStreak(days, settings.value.frozenDays, today);
  // Each checked answer once, however many skills it touches; clicked ear answers have no instrument.
  const checked = practice.events.filter(
    (e) => onInstrument(e, instrument) && e.assistance === "independent",
  ).length;
  const advice = coach({
    instrument,
    instrumentName: INSTRUMENT_LABEL[instrument],
    stats: practice.stats,
    mastery: practice.mastery,
    sessions: practice.sessions,
    streak: streak.current,
    now,
    checkedAnswers: checked,
  });
  // The weak spots wait for the coach's own bar, so the set and the coach agree.
  const weak = advice.measured
    ? weakestSkills(practice.stats, { instrument, independentOnly: true, minAttempts: 3 })
        .slice(0, 2)
        .map((s) => s.skillId)
    : [];
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
  const freezes = freezesEarned(days, settings.value.frozenDays);
  const summary = routineSummary(routine, practice.sessions, practice.events);
  // Time actually spent in each block's runs, so a block reads "40 sec played", not its plan.
  const playedMs: Record<number, number> = {};
  for (const r of summary.runs)
    if (r.params.routine === routine.id && r.endedAt > r.startedAt) {
      const n = Number(r.params.step);
      playedMs[n] = (playedMs[n] ?? 0) + r.endedAt - r.startedAt;
    }
  return {
    today,
    instrument,
    pass,
    routine,
    repeatHref,
    done,
    streak,
    freezes,
    advice,
    summary,
    playedMs,
    checked,
    /** The first day ever practised, so the week's earlier days read blank, not missed. */
    firstDay: days.length ? [...days].sort()[0] : undefined,
  };
}

/** Tomorrow's set, as today's would be built a day from now (the weekly split and the path's next step). */
export const tomorrowPlan = (strip: Instrument, minutes: number) =>
  todayPlan(strip, minutes, Date.now() + 86_400_000);

export const WEEKDAYS = [
  m.music_shell_weekday_monday(),
  m.music_shell_weekday_tuesday(),
  m.music_shell_weekday_wednesday(),
  m.music_shell_weekday_thursday(),
  m.music_shell_weekday_friday(),
  m.music_shell_weekday_saturday(),
  m.music_shell_weekday_sunday(),
];
const SPLIT_ORDER: Instrument[] = ["guitar", "ukulele", "piano", "aerophone", "mpc", "voice"];

/** Choices for a weekday in the split: "" plays the strip's instrument. */
export const splitOptions = (strip: Instrument) => [
  { value: "", label: m.music_shell_today_split_follow({ instrument: INSTRUMENT_LABEL[strip] }) },
  ...SPLIT_ORDER.map((i) => ({ value: i, label: INSTRUMENT_LABEL[i] })),
];

export function setDayInstrument(weekday: number, value: string) {
  const split = Array.from({ length: 7 }, (_, i) => settings.value.weeklySplit?.[i] ?? null);
  split[weekday] = (value || null) as Instrument | null;
  return settings.update({ weeklySplit: split });
}

/** The line under a block: why it is in the set. The skill is left out when the block already names it. */
export function blockReason(step: RoutineStep): string {
  if (!step.skillId || (step.reason !== "due" && step.reason !== "weak-spot"))
    return plainPathText(step.description);
  const name = practiceName(step.skillId);
  const why = step.reason === "due" ? m.music_shell_today_due() : m.music_shell_today_weak();
  return name === step.label ? `${why}.` : m.music_shell_today_reason_named({ why, name });
}

/**
 * One named drill for after the set: the coach's weak spot once it has measured one, else the
 * first drill on this instrument the set did not use.
 */
export function nextDrill(plan: ReturnType<typeof todayPlan>) {
  const { advice, instrument } = plan;
  if (advice.measured && advice.focus)
    return {
      label: advice.action.label,
      href: advice.action.href,
      why: m.music_shell_today_reason_named({
        why: m.music_shell_today_weak(),
        name: advice.focus.name,
      }),
    };
  const used = new Set(plan.routine.steps.map((s) => s.href.split("?")[0]));
  const e = CATALOG.find(
    (c) => c.instruments.includes(instrument) && !used.has(c.route) && !c.route.includes("?"),
  );
  return e && { label: m.music_shell_today_try({ title: e.title }), href: e.route, why: e.blurb };
}

/**
 * The row's one line: the first sentence of why the block is in the set ("Next on the Piano path.",
 * "Due for review: Intervals."). The rest waits behind the row's details.
 */
export function blockSummary(step: RoutineStep): string {
  const full = blockReason(step);
  const first = /^.*?[.!?](?=\s|$)/.exec(full)?.[0] ?? full;
  return first;
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
