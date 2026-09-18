import { describe, expect, test } from "vitest";

import {
  Capability,
  unixMs,
  type PracticeSession,
  type ScoringEvent,
} from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import type { ProgressState } from "@repo/music-core/engines/progress";
import { PracticeSessionStore } from "@repo/music-core/engines/sessions";
import { SkillGraphStore, seedCoreSkills } from "@repo/music-core/engines/skills";

import { buildChallengeBoard } from "./index";

describe("challenge projections", () => {
  test("projects daily challenges from real sessions and weak-skill analytics", async () => {
    const now = unixMs(Date.UTC(2026, 5, 26, 16));
    const today = unixMs(Date.UTC(2026, 5, 26, 12));
    const yesterday = unixMs(Date.UTC(2026, 5, 25, 12));
    const skills = new SkillGraphStore();
    const analytics = new AnalyticsEngine();
    const sessions = new PracticeSessionStore();
    await skills.seed(seedCoreSkills());

    const weak = event("weak-1", "pitch.interval.m6", today, 0, false);
    const rhythm = event("rhythm-1", "rhythm.quarter-pulse", today, 1, true);
    const reading = event("reading-1", "reading.note.treble", yesterday, 1, true);
    for (let i = 0; i < 5; i++)
      await analytics.ingest({ ...weak, id: `weak-${i}`, assistance: "independent" });
    await analytics.ingest(rhythm);
    addSession(sessions, "today", today, 125, [weak, rhythm]);
    addSession(sessions, "yesterday", yesterday, 60, [reading]);

    const board = buildChallengeBoard({
      progressState: progressState({ practicedDays: ["2026-06-25", "2026-06-26"] }),
      sessions: sessions.all(),
      skills,
      analytics,
      now,
    });

    expect(board.daily.map((challenge) => challenge.id)).toEqual([
      "daily-xp",
      "weak-spot-reps",
      "capability-variety",
      "keep-streak",
    ]);
    expect(board.daily[0]).toMatchObject({
      id: "daily-xp",
      progress: 125,
      target: 100,
      complete: true,
      href: "/music",
    });
    expect(board.daily[1]).toMatchObject({
      id: "weak-spot-reps",
      skillId: "pitch.interval.m6",
      progress: 1,
      target: 3,
      href: "/music/learn/ear/intervals",
    });
    expect(board.daily[2]).toMatchObject({ progress: 2, target: 2, complete: true });
    expect(board.weeklySummary).toMatchObject({
      xp: 185,
      sessions: 2,
      completedChallenges: 3,
    });
  });

  test("falls back to unlocked skills when analytics has no weak spot yet", async () => {
    const skills = new SkillGraphStore();
    const analytics = new AnalyticsEngine();
    await skills.seed(seedCoreSkills());

    const board = buildChallengeBoard({
      progressState: progressState(),
      sessions: [],
      skills,
      analytics,
      now: unixMs(Date.UTC(2026, 5, 26, 16)),
    });

    expect(board.daily[1]).toMatchObject({
      id: "weak-spot-reps",
      reason: "Build signal on an unlocked skill.",
      progress: 0,
      target: 3,
    });
    expect(board.weeklySummary).toMatchObject({ xp: 0, sessions: 0, completedChallenges: 0 });
  });
});

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
    metrics: [{ kind: "choice", expected: skillId, actual: correct ? skillId : "miss" }],
  };
}

function addSession(
  sessions: PracticeSessionStore,
  id: string,
  at: number,
  xp: number,
  events: ScoringEvent[],
): PracticeSession {
  const session = sessions.start({ id, startedAt: unixMs(at), source: "daily-routine" });
  for (const scoringEvent of events) sessions.recordScoringEvent(session.id, scoringEvent);
  return sessions.finish(session.id, unixMs(at + 20 * 60_000), xp);
}

function progressState(overrides: Partial<ProgressState> = {}): ProgressState {
  return {
    xp: 0,
    level: 1,
    streakDays: 0,
    streakFreezes: 0,
    practicedDays: [],
    frozenDays: [],
    achievements: [],
    lastScores: {},
    processedEventIds: [],
    ...overrides,
  };
}

function capabilityFor(skillId: string): Capability {
  if (skillId.startsWith("reading.")) return Capability.Reading;
  if (skillId.startsWith("rhythm.")) return Capability.Rhythm;
  if (skillId.startsWith("harmony.")) return Capability.Harmony;
  if (skillId.startsWith("technique.")) return Capability.Technique;
  return Capability.Pitch;
}
