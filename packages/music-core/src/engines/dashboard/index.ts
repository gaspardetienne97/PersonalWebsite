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

interface PracticeTarget {
  skillId: string;
  skillName: string;
  href: string;
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

  const practiceNext: SkillTreePracticePick[] = [];
  const seenPracticeTargets = new Set<string>();
  for (const stats of weakStats) {
    const target = practiceTargetForSkill(stats.skillId, skillById);
    if (seenPracticeTargets.has(target.skillId)) continue;
    practiceNext.push({
      skillId: target.skillId,
      skillName: target.skillName,
      href: target.href,
      accuracy: stats.accuracy,
      attempts: stats.attempts,
    });
    seenPracticeTargets.add(target.skillId);
  }

  return {
    nodes,
    relationships: args.skills.relationships.map(projectRelationship),
    practiceNext,
    capabilitySummary: capabilitySummary(nodes),
  };
}

function challengeFor(skills: SkillGraphStore, analytics: AnalyticsEngine): DashboardChallenge {
  const weak = analytics.weakestSkills(1)[0];
  if (weak) {
    const skillById = new Map(skills.skills.map((skill) => [skill.id, skill]));
    const target = practiceTargetForSkill(weak.skillId, skillById);
    return {
      skillId: target.skillId,
      skillName: target.skillName,
      reason: "weak-spot",
      label: `Practice ${target.skillName}`,
      href: target.href,
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
  return { label, href: hrefForSkill(expandedPracticeTargetSkillId(skillId)) };
}

function hrefForSkill(skillId: string): string {
  if (skillId === "ear.cadences" || skillId.startsWith("ear.cadences.")) {
    return "/music/learn/ear?drill=cadence";
  }
  if (skillId === "intonation.interval-landing") {
    return "/music/learn/aerophone?mode=interval-landing";
  }
  if (skillId === "rhythm.subdivision.eighths") return "/music/learn/rhythm?pattern=eighths";
  if (skillId === "rhythm.subdivision.sixteenths") {
    return "/music/learn/rhythm?pattern=sixteenths";
  }
  if (skillId === "rhythm.gap-click") {
    return "/music/learn/rhythm?pattern=gap-click-1-on-1-off";
  }
  if (skillId.startsWith("reading.")) return "/music/learn/reading";
  if (skillId.startsWith("rhythm.")) return "/music/learn/rhythm";
  if (skillId === "technique.aerophone.interval-landing") {
    return "/music/learn/aerophone?mode=interval-landing";
  }
  if (skillId.startsWith("technique.aerophone.")) return "/music/learn/aerophone";
  if (skillId === "technique.strings.spider.permutations") {
    return "/music/play/spider?pattern=inside-out-1324";
  }
  if (skillId.includes(".spider")) return "/music/play/spider";
  if (skillId.includes(".note-finder")) return "/music/play/spider?mode=note-finder";
  if (skillId === "technique.strings.chord-changes" || skillId.includes(".chord-changes")) {
    return "/music/play/chord-perfect?mode=changes";
  }
  if (skillId.includes(".chord-perfect") || skillId.includes(".open-chord-id")) {
    return "/music/play/chord-perfect";
  }
  if (skillId === "technique.mpc.paradiddles") return "/music/play/mpc?pattern=paradiddle";
  if (skillId.startsWith("technique.mpc")) return "/music/play/mpc";
  if (skillId === "technique.piano.independence.shell-line") {
    return "/music/play/two-hand?pattern=lh-shell-rh-line";
  }
  if (skillId.startsWith("technique.piano")) return "/music/play/two-hand";
  if (skillId.startsWith("technique.")) return "/music/play/scales";
  if (skillId.startsWith("harmony.") || skillId.startsWith("pitch.")) return "/music/learn/ear";
  return "/music/learn";
}

function practiceTargetForSkill(
  skillId: string,
  skillById: ReadonlyMap<string, { name: string }>,
): PracticeTarget {
  const targetId = expandedPracticeTargetSkillId(skillId);
  return {
    skillId: targetId,
    skillName: skillById.get(targetId)?.name ?? targetId,
    href: hrefForSkill(targetId),
  };
}

function expandedPracticeTargetSkillId(skillId: string): string {
  const expansion: Record<string, string> = {
    "rhythm.subdivisions": "rhythm.subdivision.eighths",
    "rhythm.eighths": "rhythm.subdivision.eighths",
    "rhythm.sixteenths": "rhythm.subdivision.sixteenths",
    "technique.strings": "technique.strings.spider.permutations",
    "technique.strings.spider": "technique.strings.spider.permutations",
    "technique.guitar.spider": "technique.strings.spider.permutations",
    "technique.ukulele.spider": "technique.strings.spider.permutations",
    "technique.strings.chord-perfect": "technique.strings.chord-changes",
    "technique.guitar.chord-perfect": "technique.guitar.chord-changes",
    "technique.ukulele.chord-perfect": "technique.ukulele.chord-changes",
    "technique.mpc": "technique.mpc.paradiddles",
    "technique.mpc.single-strokes": "technique.mpc.paradiddles",
    "technique.piano": "technique.piano.independence.shell-line",
    "technique.piano.two-hand-independence": "technique.piano.independence.shell-line",
    "technique.aerophone": "technique.aerophone.interval-landing",
  };
  return expansion[skillId] ?? skillId;
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
