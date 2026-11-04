// Journal projections (catalog 5.9): weekly rollups, heatmap, focus areas, goals, filters,
// and "vs last run with the same setup".
import type { Instrument, PracticeSession, RunRecord } from "../types";
import { addDays, dayKey, weekStart } from "./rewards";

export interface Rollup {
  xp: number;
  sessions: number;
  attempts: number;
  minutes: number;
}

const sessionEnd = (s: PracticeSession) =>
  s.endTime ?? Math.max(s.startTime, ...s.runs.map((r) => r.endedAt));

export const sessionMinutes = (s: PracticeSession) => (sessionEnd(s) - s.startTime) / 60_000;

function rollup(sessions: PracticeSession[]): Rollup {
  return {
    xp: sessions.reduce((n, s) => n + s.xp, 0),
    sessions: sessions.length,
    attempts: sessions.reduce((n, s) => n + s.eventIds.length, 0),
    minutes: Math.round(sessions.reduce((n, s) => n + sessionMinutes(s), 0)),
  };
}

const inDays = (sessions: PracticeSession[], from: string, to: string) =>
  sessions.filter((s) => {
    const d = dayKey(s.startTime);
    return d >= from && d <= to;
  });

/** ISO weeks (Monday start, UTC). */
export function weekRollups(sessions: PracticeSession[], today: string) {
  const thisStart = weekStart(today);
  const lastStart = addDays(thisStart, -7);
  const thisWeek = rollup(inDays(sessions, thisStart, addDays(thisStart, 6)));
  const lastWeek = rollup(inDays(sessions, lastStart, addDays(lastStart, 6)));
  const delta: Rollup = {
    xp: thisWeek.xp - lastWeek.xp,
    sessions: thisWeek.sessions - lastWeek.sessions,
    attempts: thisWeek.attempts - lastWeek.attempts,
    minutes: thisWeek.minutes - lastWeek.minutes,
  };
  return { thisWeek, lastWeek, delta };
}

export interface HeatCell {
  day: string;
  minutes: number;
  sessions: number;
  xp: number;
  /** 0 (none) to 4 (most), relative to the busiest day shown. */
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
}

/** 12 ISO weeks x 7 days, Monday first, ending with the week containing `today`. */
export function heatmap(sessions: PracticeSession[], today: string, weeks = 12): HeatCell[] {
  const start = addDays(weekStart(today), -7 * (weeks - 1));
  const cells = Array.from({ length: weeks * 7 }, (_, i) => {
    const day = addDays(start, i);
    const own = inDays(sessions, day, day);
    return {
      day,
      minutes: Math.round(own.reduce((n, s) => n + sessionMinutes(s), 0)),
      sessions: own.length,
      xp: own.reduce((n, s) => n + s.xp, 0),
      future: day > today,
    };
  });
  return cells.map((c) => ({
    ...c,
    level: (c.sessions === 0
      ? 0
      : 1 + HEAT_BANDS.filter((m) => c.minutes >= m).length) as HeatCell["level"],
  }));
}

/**
 * Fixed minute bands for the heatmap shades, so a legend can name them: level 1 is any practice
 * under 5 min, 2 from 5 min, 3 from 15 min, 4 from 30 min.
 */
export const HEAT_BANDS = [5, 15, 30] as const;

/** Session tags by frequency. */
export function focusAreas(sessions: PracticeSession[], limit = 5) {
  const counts = new Map<string, number>();
  for (const s of sessions)
    for (const t of new Set(s.tags)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

export function weeklyGoals(sessions: PracticeSession[], today: string, sessionGoal: number) {
  const { thisWeek, lastWeek } = weekRollups(sessions, today);
  return {
    sessions: {
      done: thisWeek.sessions,
      target: sessionGoal,
      met: thisWeek.sessions >= sessionGoal,
    },
    xp: { thisWeek: thisWeek.xp, lastWeek: lastWeek.xp, ahead: thisWeek.xp >= lastWeek.xp },
  };
}

export interface JournalFilter {
  skillId?: string;
  instrument?: Instrument;
  /** Inclusive UTC day keys. */
  from?: string;
  to?: string;
}

export function filterSessions(sessions: PracticeSession[], f: JournalFilter): PracticeSession[] {
  return sessions.filter((s) => {
    const d = dayKey(s.startTime);
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    if (
      f.instrument &&
      s.instrument !== f.instrument &&
      !s.runs.some((r) => r.instrument === f.instrument)
    )
      return false;
    if (f.skillId && !s.runs.some((r) => r.skillIds.includes(f.skillId!))) return false;
    return true;
  });
}

const runsFor = (sessions: PracticeSession[], exerciseId: string, setupKey: string) =>
  sessions
    .flatMap((s) => s.runs)
    .filter((r) => r.exerciseId === exerciseId && r.setupKey === setupKey);

/** The most recent run with this setup that ended before `before` (default: any). */
export function lastRunForSetup(
  sessions: PracticeSession[],
  exerciseId: string,
  setupKey: string,
  before = Infinity,
): RunRecord | undefined {
  return runsFor(sessions, exerciseId, setupKey)
    .filter((r) => r.endedAt < before)
    .sort((a, b) => b.endedAt - a.endedAt)[0];
}

/** The highest-scoring run with this setup (earliest wins a tie). */
export function personalBest(
  sessions: PracticeSession[],
  exerciseId: string,
  setupKey: string,
): RunRecord | undefined {
  return runsFor(sessions, exerciseId, setupKey)
    .filter((r) => r.score !== undefined)
    .sort((a, b) => b.score! - a.score! || a.endedAt - b.endedAt)[0];
}
