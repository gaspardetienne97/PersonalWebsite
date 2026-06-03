import { describe, expect, test } from "vitest";

import { Capability, unixMs, type ScoringEvent } from "@repo/music-core/domain";

import { PracticeSessionStore } from "./index";

const event = (id: string, skillId: string, at: number): ScoringEvent => ({
  id,
  sessionId: "session-1",
  exerciseId: "exercise-1",
  skillIds: [skillId],
  capabilities: [Capability.Harmony],
  at: unixMs(at),
  correct: true,
  partialCredit: 1,
  difficulty: 0.5,
  metrics: [],
});

describe("PracticeSessionStore", () => {
  test("persists a completed session and queries by skill and date", async () => {
    const sessions = new PracticeSessionStore();
    const session = sessions.start({
      id: "session-1",
      instrument: "piano",
      source: "daily-routine",
      startedAt: unixMs(Date.UTC(2026, 0, 2)),
    });

    sessions.recordRun(session.id, {
      id: "run-1",
      exerciseId: "ear.interval",
      startedAt: session.startTime,
      endedAt: unixMs(Date.UTC(2026, 0, 2, 0, 5)),
      promptIds: ["prompt-1"],
      targetSkillIds: ["harmony.ii-v-i"],
      instrument: "piano",
      difficulty: 0.5,
    });
    sessions.recordScoringEvent(
      session.id,
      event("event-1", "harmony.ii-v-i", Date.UTC(2026, 0, 2)),
    );
    sessions.finish(session.id, unixMs(Date.UTC(2026, 0, 2, 0, 10)), 42, "Worked ii-V-I slowly.");

    expect(sessions.bySkill("harmony.ii-v-i")).toHaveLength(1);
    expect(sessions.byInstrument("piano")).toHaveLength(1);
    expect(
      sessions.byDateRange(unixMs(Date.UTC(2026, 0, 1)), unixMs(Date.UTC(2026, 0, 3))),
    ).toHaveLength(1);
    expect(sessions.summarize(session.id).meanScore).toBe(1);
  });
});
