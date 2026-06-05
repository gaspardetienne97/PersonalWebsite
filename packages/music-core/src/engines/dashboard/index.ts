import {
  SkillRelationKind,
  type Capability,
  type InstrumentId,
  type PracticeSession,
  type SkillRelationship,
  type UnixMs,
  unixMs,
} from "@repo/music-core/domain";
import type { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import type { ProgressState } from "@repo/music-core/engines/progress";
import type { SkillGraphStore } from "@repo/music-core/engines/skills";

export interface DashboardAction {
  label: string;
  href: string;
}

export interface DashboardRoutineItem extends DashboardAction {
  description: string;
}

export interface DashboardChallenge extends DashboardAction {
  skillId: string;
  skillName: string;
  reason: "weak-spot" | "new-skill";
}

export interface DashboardView {
  todayXp: number;
  todayGoalXp: number;
  todayGoalProgress: number;
  streakDays: number;
  level: number;
  achievements: string[];
  recentInstruments: InstrumentId[];
  continuePractice: DashboardAction;
  dailyChallenge: DashboardChallenge;
  todaysRoutine: DashboardRoutineItem[];
  streakCalendar: { day: string; practiced: boolean; frozen: boolean }[];
}

export interface BuildDashboardViewArgs {
  progressState: ProgressState;
  sessions: PracticeSession[];
  skills: SkillGraphStore;
  analytics: AnalyticsEngine;
  now?: UnixMs;
  dailyGoalXp?: number;
}

export interface SkillTreeNode {
  id: string;
  name: string;
  capability: Capability;
  level?: string;
  tags: string[];
  masteryPercent: number;
  confidencePercent: number;
  observations: number;
  unlocked: boolean;
  weakSpot: boolean;
  practiceHref: string;
}

export interface SkillTreeRelationship {
  from: string;
  to: string;
  kind: SkillRelationKind;
}

export interface SkillTreePracticePick {
  skillId: string;
  skillName: string;
  href: string;
  accuracy: number;
  attempts: number;
}

export interface SkillTreeView {
  nodes: SkillTreeNode[];
  relationships: SkillTreeRelationship[];
  practiceNext: SkillTreePracticePick[];
  capabilitySummary: Record<string, { total: number; mastered: number; averageMastery: number }>;
}

export interface BuildSkillTreeViewArgs {
  skills: SkillGraphStore;
  analytics: AnalyticsEngine;
}

export function buildDashboardView(args: BuildDashboardViewArgs): DashboardView {
  const now = args.now ?? unixMs(Date.now());
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = unixMs(todayStart + DAY_MS);
  const todaySessions = args.sessions.filter(
    (session) => session.startTime >= todayStart && session.startTime < tomorrowStart,
  );
  const todayXp = todaySessions.reduce((total, session) => total + session.xpEarned, 0);
  const todayGoalXp = args.dailyGoalXp ?? 100;
  const dailyChallenge = challengeFor(args.skills, args.analytics);

  return {
    todayXp,
    todayGoalXp,
    todayGoalProgress: todayGoalXp === 0 ? 1 : clamp01(todayXp / todayGoalXp),
    streakDays: args.progressState.streakDays,
    level: args.progressState.level,
    achievements: [...args.progressState.achievements],
    recentInstruments: recentInstruments(args.sessions),
    continuePractice: actionForSkill(dailyChallenge.skillId, "Continue practice"),
    dailyChallenge,
    todaysRoutine: [
      {
        label: "Ear Training",
        href: "/music/learn/ear",
        description: "Recognition and weak-spot review.",
      },
      {
        label: "Note Reading",
        href: "/music/learn/reading",
        description: "Flashcards and sight-reading.",
      },
      {
        label: "Scales",
        href: "/music/play/scales",
        description: "Technique and tempo progression.",
      },
    ],
    streakCalendar: streakCalendar(args.progressState, now),
  };
}

export function buildSkillTreeView(args: BuildSkillTreeViewArgs): SkillTreeView {
  const unlockedIds = new Set(args.skills.unlockedSkills().map((skill) => skill.id));
  const weakStats = args.analytics.weakestSkills(8);
  const weakIds = new Set(weakStats.map((stats) => stats.skillId));
  const skillById = new Map(args.skills.skills.map((skill) => [skill.id, skill]));

  const nodes = args.skills.skills
    .map((skill) => {
      const mastery = args.skills.getMastery(skill.id);
      return {
        id: skill.id,
        name: skill.name,
        capability: skill.capability,
        ...(skill.level === undefined ? {} : { level: skill.level }),
        tags: [...(skill.tags ?? [])],
        masteryPercent: Math.round(mastery.mastery * 100),
        confidencePercent: Math.round(mastery.confidence * 100),
        observations: mastery.observations,
        unlocked: unlockedIds.has(skill.id),
        weakSpot: weakIds.has(skill.id),
        practiceHref: hrefForSkill(skill.id),
      };
    })
    .sort(
      (a, b) =>
        String(a.capability).localeCompare(String(b.capability)) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );

  return {
    nodes,
    relationships: args.skills.relationships.map(projectRelationship),
    practiceNext: weakStats.map((stats) => ({
      skillId: stats.skillId,
      skillName: skillById.get(stats.skillId)?.name ?? stats.skillId,
      href: hrefForSkill(stats.skillId),
      accuracy: stats.accuracy,
      attempts: stats.attempts,
    })),
    capabilitySummary: capabilitySummary(nodes),
  };
}

function challengeFor(skills: SkillGraphStore, analytics: AnalyticsEngine): DashboardChallenge {
  const weak = analytics.weakestSkills(1)[0];
  if (weak) {
    const skill = skills.skills.find((item) => item.id === weak.skillId);
    return {
      skillId: weak.skillId,
      skillName: skill?.name ?? weak.skillId,
      reason: "weak-spot",
      label: `Practice ${skill?.name ?? weak.skillId}`,
      href: hrefForSkill(weak.skillId),
    };
  }

  const next = skills.unlockedSkills()[0] ?? skills.skills[0];
  return {
    skillId: next?.id ?? "pitch.intervals",
    skillName: next?.name ?? "Intervals",
    reason: "new-skill",
    label: `Start ${next?.name ?? "Intervals"}`,
    href: hrefForSkill(next?.id ?? "pitch.intervals"),
  };
}

function actionForSkill(skillId: string, label: string): DashboardAction {
  return { label, href: hrefForSkill(skillId) };
}

function hrefForSkill(skillId: string): string {
  if (skillId.startsWith("reading.")) return "/music/learn/reading";
  if (skillId.startsWith("rhythm.")) return "/music/learn/rhythm";
  if (skillId.startsWith("technique.")) return "/music/play/scales";
  if (skillId.startsWith("harmony.") || skillId.startsWith("pitch.")) return "/music/learn/ear";
  return "/music/learn";
}

function recentInstruments(sessions: PracticeSession[]): InstrumentId[] {
  const instruments: InstrumentId[] = [];
  for (const session of [...sessions].sort((a, b) => b.startTime - a.startTime)) {
    if (session.instrument && !instruments.includes(session.instrument)) {
      instruments.push(session.instrument);
    }
    if (instruments.length >= 4) break;
  }
  return instruments;
}

function streakCalendar(
  progressState: ProgressState,
  now: UnixMs,
): { day: string; practiced: boolean; frozen: boolean }[] {
  const today = startOfUtcDay(now);
  return Array.from({ length: 14 }, (_item, index) => {
    const at = unixMs(today - (13 - index) * DAY_MS);
    const day = new Date(at).toISOString().slice(0, 10);
    return {
      day,
      practiced: progressState.practicedDays.includes(day),
      frozen: progressState.frozenDays.includes(day),
    };
  });
}

function projectRelationship(relationship: SkillRelationship): SkillTreeRelationship {
  return {
    from: relationship.from,
    to: relationship.to,
    kind: relationship.kind,
  };
}

function capabilitySummary(nodes: SkillTreeNode[]): SkillTreeView["capabilitySummary"] {
  const summary: SkillTreeView["capabilitySummary"] = {};
  for (const node of nodes) {
    const key = String(node.capability);
    const current = summary[key] ?? { total: 0, mastered: 0, averageMastery: 0 };
    current.averageMastery =
      (current.averageMastery * current.total + node.masteryPercent) / (current.total + 1);
    current.total += 1;
    if (node.masteryPercent >= 80) current.mastered += 1;
    summary[key] = current;
  }
  for (const value of Object.values(summary)) {
    value.averageMastery = Math.round(value.averageMastery);
  }
  return summary;
}

function startOfUtcDay(at: UnixMs): UnixMs {
  const date = new Date(at);
  return unixMs(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const DAY_MS = 86_400_000;
