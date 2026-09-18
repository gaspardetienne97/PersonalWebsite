import { describe, expect, test } from "vitest";

import {
  Capability,
  SkillRelationKind,
  unixMs,
  type PracticeSession,
  type ScoringEvent,
} from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { PracticeSessionStore } from "@repo/music-core/engines/sessions";
import { SkillGraphStore, seedCoreSkills } from "@repo/music-core/engines/skills";

import { buildDashboardView, buildSkillTreeView } from "./index";

describe("dashboard projections", () => {
  test("ages review estimates without changing history, eligibility, or earned unlocks", async () => {
    const { analytics, skills } = await setup();
    const now = unixMs(Date.UTC(2026, 8, 8));
    const old = unixMs(now - 90 * 86_400_000);
    for (let i = 0; i < 10; i += 1) {
      for (const [id, at, correct] of [
        ["rhythm.quarter-pulse", old, true],
        ["harmony.seventh.dominant", now, i < 7],
      ] as const) {
        const evidence = {
          ...event(`${id}-${i}`, id, at, correct ? 1 : 0, correct),
          instrument: "piano" as const,
        };
        await skills.ingest(evidence);
        await analytics.ingest(evidence);
      }
    }
    const stored = structuredClone(skills.getMastery("rhythm.quarter-pulse"));
    const unlocked = skills.unlockedSkills();
    const view = buildSkillTreeView({ skills, analytics, instrument: "piano", now });
    expect(view.practiceNext[0]).toMatchObject({
      skillId: "rhythm.quarter-pulse",
      accuracy: 1,
      dueForReview: true,
      lastPracticed: old,
    });
    expect(view.nodes.find((node) => node.id === "rhythm.quarter-pulse")).toMatchObject({
      masteryPercent: Math.round(stored.mastery * Math.exp(-stored.decayRate * 90) * 100),
      dueForReview: true,
      lastPracticed: old,
    });
    expect(buildSkillTreeView({ skills, analytics, instrument: "piano", now })).toEqual(view);
    expect(skills.getMastery("rhythm.quarter-pulse")).toEqual(stored);
    expect(skills.unlockedSkills()).toEqual(unlocked);
    expect(
      buildSkillTreeView({ skills, analytics, instrument: "guitar", now }).practiceNext,
    ).toEqual([]);
  });

  test("routes specific jazz skills to their matching drill variant", async () => {
    const { analytics, skills } = await setup();
    const nodes = buildSkillTreeView({ analytics, skills }).nodes;
    for (const [id, href] of [
      ["voicings.altered", "/music/play/voicings?variant=altered"],
      ["chord-scales.minor", "/music/play/chord-scales?changes=minor"],
      ["licks.minor-ii-V-i", "/music/play/licks?category=minor-ii-V-i"],
    ])
      expect(nodes.find((node) => node.id === `harmony.ii-v-i.${id}`)?.practiceHref).toBe(href);
  });
  test("builds dashboard state from progress, sessions, and weak spots", async () => {
    const { analytics, progress, sessions, skills } = await setup();
    const today = unixMs(Date.UTC(2026, 0, 16, 14));
    const yesterday = unixMs(Date.UTC(2026, 0, 15, 14));
    const weakEvent = event("weak-1", "pitch.interval.m6", today, 0, false);
    const strongEvent = event("strong-1", "rhythm.quarter-pulse", today, 1, true);

    for (let i = 0; i < 5; i += 1) await analytics.ingest({ ...weakEvent, id: `weak-${i}` });
    await analytics.ingest(strongEvent);
    const weakXp = await progress.ingest(weakEvent, skills);
    const strongXp = await progress.ingest(strongEvent, skills);
    addSession(sessions, "today-piano", today, "piano", weakXp + strongXp, [
      weakEvent,
      strongEvent,
    ]);
    addSession(sessions, "yesterday-guitar", yesterday, "guitar", 12, [
      event("old-1", "technique.scale.major", yesterday, 1, true),
    ]);

    const view = buildDashboardView({
      progressState: progress.state,
      sessions: sessions.all(),
      skills,
      analytics,
      now: today,
      dailyGoalXp: 100,
    });

    expect(view.todayXp).toBe(weakXp + strongXp);
    expect(view.todayGoalXp).toBe(100);
    expect(view.todayGoalProgress).toBe((weakXp + strongXp) / 100);
    expect(view.streakDays).toBe(1);
    expect(view.recentInstruments).toEqual(["piano", "guitar"]);
    expect(view.continuePractice.href).toBe("/music/learn/ear/intervals");
    expect(view.dailyChallenge.skillId).toBe("pitch.interval.m6");
    expect(view.todaysRoutine.map((item) => item.href)).toEqual([
      "/music/learn/ear/intervals",
      "/music/learn/reading",
      "/music/learn/rhythm",
      "/music/play/scales",
    ]);
  });

  test("builds a skill tree with mastery rings, prerequisites, and practice picks", async () => {
    const { analytics, skills } = await setup();
    const practiced = event("practiced-1", "rhythm.quarter-pulse", Date.UTC(2026, 0, 16), 1, true);
    const weak = event("weak-1", "harmony.seventh.dominant", Date.UTC(2026, 0, 16), 0, false);

    await skills.ingest(practiced);
    for (let i = 0; i < 5; i += 1) await analytics.ingest({ ...weak, id: `weak-${i}` });

    const view = buildSkillTreeView({ skills, analytics, now: practiced.at });
    const rhythm = view.nodes.find((node) => node.id === "rhythm.quarter-pulse");
    const dominant = view.nodes.find((node) => node.id === "harmony.seventh.dominant");

    expect(rhythm).toMatchObject({
      id: "rhythm.quarter-pulse",
      masteryPercent: expect.any(Number),
      unlocked: true,
    });
    expect(rhythm!.masteryPercent).toBeGreaterThan(0);
    expect(dominant).toMatchObject({
      id: "harmony.seventh.dominant",
      weakSpot: true,
      practiceHref: "/music/learn/ear/chord-qualities",
    });
    expect(view.relationships).toContainEqual({
      from: "harmony.seventh.dominant",
      to: "harmony.ii-v-i",
      kind: SkillRelationKind.Prerequisite,
    });
    expect(view.practiceNext[0]?.skillId).toBe("harmony.seventh.dominant");
  });

  test("weak skills are remediated at their own base drill, not a harder variant", async () => {
    const { analytics, progress, sessions, skills } = await setup();
    const today = unixMs(Date.UTC(2026, 0, 16, 14));
    for (let i = 0; i < 5; i += 1)
      await analytics.ingest(
        event(`weak-spider-${i}`, "technique.strings.spider", today, 0, false),
      );

    // A weak spider skill recommends the spider drill itself (base pattern) —
    // not the permutations variant. Escalation is progression, not remediation.
    const skillTree = buildSkillTreeView({ skills, analytics });
    expect(skillTree.practiceNext[0]).toMatchObject({
      skillId: "technique.strings.spider",
      skillName: "Chromatic Spider Drill",
      href: "/music/play/spider",
      accuracy: 0,
      attempts: 5,
    });

    const dashboard = buildDashboardView({
      progressState: progress.state,
      sessions: sessions.all(),
      skills,
      analytics,
      now: today,
    });
    expect(dashboard.dailyChallenge).toMatchObject({
      skillId: "technique.strings.spider",
      skillName: "Chromatic Spider Drill",
      href: "/music/play/spider",
      reason: "weak-spot",
    });
    expect(dashboard.continuePractice.href).toBe("/music/play/spider");
  });

  test("umbrella skills without a drill of their own route to a base drill", async () => {
    const { analytics, skills } = await setup();
    const today = unixMs(Date.UTC(2026, 0, 16, 14));
    for (let i = 0; i < 5; i += 1)
      await analytics.ingest(event(`weak-mpc-parent-${i}`, "technique.mpc", today, 0, false));

    const skillTree = buildSkillTreeView({ skills, analytics });
    // technique.mpc has no drill itself; it lands on single strokes (the base
    // MPC drill), never on the paradiddle variant.
    expect(skillTree.practiceNext[0]).toMatchObject({
      skillId: "technique.mpc.single-strokes",
      href: "/music/play/mpc",
    });
  });
});

async function setup() {
  const skills = new SkillGraphStore();
  await skills.seed(seedCoreSkills());
  return {
    analytics: new AnalyticsEngine(),
    progress: new ProgressEngine(),
    sessions: new PracticeSessionStore(),
    skills,
  };
}

function event(
  id: string,
  skillId: string,
  at: number,
  partialCredit: number,
  correct: boolean,
): ScoringEvent {
  return {
    id,
    sessionId: "session-1",
    exerciseId: "exercise-1",
    skillIds: [skillId],
    capabilities: [capabilityFor(skillId)],
    at: unixMs(at),
    correct,
    partialCredit,
    difficulty: 0.6,
    assistance: "independent",
    metrics: [{ kind: "choice", expected: skillId, actual: correct ? skillId : "miss" }],
  };
}

function addSession(
  sessions: PracticeSessionStore,
  id: string,
  at: number,
  instrument: PracticeSession["instrument"],
  xp: number,
  events: ScoringEvent[],
): void {
  const session = sessions.start({
    id,
    startedAt: unixMs(at),
    source: "daily-routine",
    ...(instrument === undefined ? {} : { instrument }),
  });
  for (const scoringEvent of events) sessions.recordScoringEvent(session.id, scoringEvent);
  sessions.finish(session.id, unixMs(at + 20 * 60_000), xp);
}

function capabilityFor(skillId: string): Capability {
  if (skillId.startsWith("rhythm.")) return Capability.Rhythm;
  if (skillId.startsWith("harmony.")) return Capability.Harmony;
  if (skillId.startsWith("technique.")) return Capability.Technique;
  return Capability.Pitch;
}
