import type { PracticeSession } from "@repo/music-core/domain";
import type { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import { buildSkillTreeView } from "@repo/music-core/engines/dashboard";
import {
  buildDailyRoutinePlan,
  type DailyRoutineStep,
} from "@repo/music-core/engines/daily-routine";
import type { ProgressState } from "@repo/music-core/engines/progress";
import type { SkillGraphStore } from "@repo/music-core/engines/skills";

export interface PracticeCoachFocus {
  skillId: string;
  skillName: string;
  href: string;
  accuracy: number;
  attempts: number;
}

export interface PracticeCoachView {
  headline: string;
  summary: string;
  focus?: PracticeCoachFocus;
  routine: DailyRoutineStep[];
  insights: string[];
  primaryAction: { label: string; href: string };
}

export interface BuildPracticeCoachViewArgs {
  skills: SkillGraphStore;
  analytics: AnalyticsEngine;
  progressState: ProgressState;
  sessions: PracticeSession[];
}

export function buildPracticeCoachView(args: BuildPracticeCoachViewArgs): PracticeCoachView {
  const skillTree = buildSkillTreeView({ skills: args.skills, analytics: args.analytics });
  const weak = skillTree.practiceNext[0];
  const focus = weak
    ? {
        skillId: weak.skillId,
        skillName: weak.skillName,
        href: weak.href,
        accuracy: weak.accuracy,
        attempts: weak.attempts,
      }
    : undefined;
  const routine = buildDailyRoutinePlan(skillTree.practiceNext);

  return {
    headline: focus ? `Coach focus: ${focus.skillName}` : "Build a balanced routine",
    summary: focus
      ? `Start with ${focus.skillName}, then run a short balanced routine.`
      : "No weak spot has enough history yet, so start with the balanced daily routine.",
    ...(focus === undefined ? {} : { focus }),
    routine,
    insights: insightsFor(args.progressState, args.sessions, focus),
    primaryAction: focus
      ? { label: `Practice ${focus.skillName}`, href: focus.href }
      : { label: "Start daily routine", href: "/music/routine" },
  };
}

function insightsFor(
  progress: ProgressState,
  sessions: PracticeSession[],
  focus: PracticeCoachFocus | undefined,
): string[] {
  const insights: string[] = [];
  if (focus) {
    insights.push(
      `${Math.round(focus.accuracy * 100)}% accuracy across ${focus.attempts} attempt${
        focus.attempts === 1 ? "" : "s"
      }.`,
    );
  } else {
    insights.push("Add a few scored reps to unlock weak-spot coaching.");
  }
  if (progress.streakDays > 0) insights.push(`${progress.streakDays}-day streak is active.`);
  if (sessions.length > 0)
    insights.push(`${sessions.length} saved practice session${sessions.length === 1 ? "" : "s"}.`);
  return insights;
}
