import type { PracticeSession, UnixMs } from "@repo/music-core/domain";
import type { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import type { ProgressState } from "@repo/music-core/engines/progress";
import type { SkillGraphStore } from "@repo/music-core/engines/skills";

export type ChallengeKind = "daily-xp" | "weak-spot-reps" | "capability-variety" | "keep-streak";

export interface PracticeChallenge {
  id: ChallengeKind;
  title: string;
  description: string;
  href: string;
  progress: number;
  target: number;
  complete: boolean;
  reason: string;
  skillId?: string;
  skillName?: string;
}

export interface ChallengeBoard {
  daily: PracticeChallenge[];
  weeklySummary: {
    xp: number;
    sessions: number;
    completedChallenges: number;
  };
}

export interface BuildChallengeBoardArgs {
  progressState: ProgressState;
  sessions: PracticeSession[];
  skills: SkillGraphStore;
  analytics: AnalyticsEngine;
  now?: UnixMs;
  dailyXpTarget?: number;
  weakRepTarget?: number;
  varietyTarget?: number;
}

const DAY_MS = 86_400_000;
const WEEK_MS = DAY_MS * 7;

export function buildChallengeBoard(args: BuildChallengeBoardArgs): ChallengeBoard {
  const now = args.now ?? (Date.now() as UnixMs);
  const dailyXpTarget = args.dailyXpTarget ?? 100;
  const weakRepTarget = args.weakRepTarget ?? 3;
  const varietyTarget = args.varietyTarget ?? 2;
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = (todayStart + DAY_MS) as UnixMs;
  const weekStart = startOfUtcWeek(now);
  const todaySessions = sessionsInRange(args.sessions, todayStart, tomorrowStart);
  const weekSessions = sessionsInRange(args.sessions, weekStart, (weekStart + WEEK_MS) as UnixMs);
  const weakPick = selectWeakPick(args.skills, args.analytics);
  const todayEvents = todaySessions.flatMap((session) => session.scoringEvents);
  const todayXp = sumXp(todaySessions);
  const weakReps = countSkillEvents(todaySessions, weakPick.skillId);
  const capabilities = new Set(todayEvents.flatMap((event) => event.capabilities));
  const todayDay = new Date(todayStart).toISOString().slice(0, 10);
  const practicedToday = args.progressState.practicedDays.includes(todayDay);

  const daily: PracticeChallenge[] = [
    {
      id: "daily-xp",
      title: "Hit today's XP",
      description: "Finish one focused block and keep the day moving.",
      href: "/music/routine",
      progress: todayXp,
      target: dailyXpTarget,
      complete: todayXp >= dailyXpTarget,
      reason: "Based on XP earned in today's saved practice sessions.",
    },
    {
      id: "weak-spot-reps",
      title: weakPick.skillName,
      description: "Run a few reps against the skill that needs the next signal.",
      href: hrefForSkill(weakPick.skillId),
      progress: weakReps,
      target: weakRepTarget,
      complete: weakReps >= weakRepTarget,
      reason: weakPick.reason,
      skillId: weakPick.skillId,
      skillName: weakPick.skillName,
    },
    {
      id: "capability-variety",
      title: "Cross-train two skills",
      description: "Touch two capability areas so practice does not collapse into one lane.",
      href: "/music/learn",
      progress: capabilities.size,
      target: varietyTarget,
      complete: capabilities.size >= varietyTarget,
      reason: "Counts distinct capability areas from today's scoring events.",
    },
    {
      id: "keep-streak",
      title: "Keep the streak alive",
      description: "Log any scoring practice today.",
      href: "/music",
      progress: practicedToday ? 1 : 0,
      target: 1,
      complete: practicedToday,
      reason: "Uses the same practiced-day record as the main streak.",
    },
  ];

  return {
    daily,
    weeklySummary: {
      xp: sumXp(weekSessions),
      sessions: weekSessions.length,
      completedChallenges: daily.filter((challenge) => challenge.complete).length,
    },
  };
}

function selectWeakPick(
  skills: SkillGraphStore,
  analytics: AnalyticsEngine,
): { skillId: string; skillName: string; reason: string } {
  const weak = analytics.weakestSkills(1)[0];
  if (weak) {
    const skill = skills.skills.find((item) => item.id === weak.skillId);
    return {
      skillId: weak.skillId,
      skillName: skill?.name ?? weak.skillId,
      reason: "Review your weakest analytics signal.",
    };
  }

  const next = skills.unlockedSkills()[0] ?? skills.skills[0];
  return {
    skillId: next?.id ?? "pitch.intervals",
    skillName: next?.name ?? "Intervals",
    reason: "Build signal on an unlocked skill.",
  };
}

function sessionsInRange(
  sessions: PracticeSession[],
  start: UnixMs,
  end: UnixMs,
): PracticeSession[] {
  return sessions.filter((session) => session.startTime >= start && session.startTime < end);
}

function sumXp(sessions: PracticeSession[]): number {
  return sessions.reduce((total, session) => total + session.xpEarned, 0);
}

function countSkillEvents(sessions: PracticeSession[], skillId: string): number {
  return sessions.reduce(
    (total, session) =>
      total +
      session.scoringEvents.filter((event) => event.skillIds.includes(skillId)).length +
      session.runs.filter((run) => run.targetSkillIds.includes(skillId)).length,
    0,
  );
}

function hrefForSkill(skillId: string): string {
  if (skillId.startsWith("reading.")) return "/music/learn/reading";
  if (skillId.startsWith("rhythm.")) return "/music/learn/rhythm";
  if (skillId.startsWith("technique.")) return "/music/play/scales";
  if (skillId.startsWith("harmony.")) return "/music/learn/theory";
  if (skillId.startsWith("pitch.")) return "/music/learn/ear";
  return "/music/learn";
}

function startOfUtcDay(at: UnixMs): UnixMs {
  const date = new Date(at);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) as UnixMs;
}

function startOfUtcWeek(at: UnixMs): UnixMs {
  const dayStart = startOfUtcDay(at);
  const day = new Date(dayStart).getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return (dayStart - daysSinceMonday * DAY_MS) as UnixMs;
}
