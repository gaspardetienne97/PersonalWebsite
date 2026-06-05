import { afterEach, describe, expect, test } from "vitest";

import { Capability, unixMs, type ScoringEvent } from "@repo/music-core/domain";
import { PracticeDatabase, PracticeStore } from "@repo/music-core/engines/store";

import { PracticeSessionStore } from "./index";

const databases: PracticeDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.map((database) => database.delete()));
  databases.length = 0;
});

const event = (
  id: string,
  skillId: string,
  at: number,
  sessionId = "session-1",
  partialCredit = 1,
): ScoringEvent => ({
  id,
  sessionId,
  exerciseId: "exercise-1",
  skillIds: [skillId],
  capabilities: [Capability.Harmony],
  at: unixMs(at),
  correct: partialCredit >= 0.9,
  partialCredit,
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

  test("persists completed sessions and reloads query views", async () => {
    const store = createStore();
    const sessions = new PracticeSessionStore(store);
    const session = sessions.start({
      id: "session-1",
      instrument: "piano",
      source: "drill",
      startedAt: unixMs(Date.UTC(2026, 0, 6, 15)),
      tags: ["morning", "harmony"],
    });

    sessions.recordRun(session.id, {
      id: "run-1",
      exerciseId: "harmony.drill",
      startedAt: session.startTime,
      endedAt: unixMs(Date.UTC(2026, 0, 6, 15, 12)),
      promptIds: ["prompt-1", "prompt-2"],
      targetSkillIds: ["harmony.ii-v-i"],
      instrument: "piano",
      difficulty: 0.5,
      params: { tempo: 80 },
    });
    sessions.recordScoringEvent(
      session.id,
      event("event-1", "harmony.ii-v-i", Date.UTC(2026, 0, 6, 15, 6)),
    );
    sessions.finish(session.id, unixMs(Date.UTC(2026, 0, 6, 15, 15)), 48, "Voicings felt clean.");
    await sessions.flush();

    const reloaded = new PracticeSessionStore(store);
    await reloaded.load();

    expect(reloaded.bySkill("harmony.ii-v-i")).toHaveLength(1);
    expect(reloaded.byInstrument("piano")).toHaveLength(1);
    expect(
      reloaded.byDateRange(unixMs(Date.UTC(2026, 0, 6)), unixMs(Date.UTC(2026, 0, 7))),
    ).toHaveLength(1);
    expect(reloaded.query({ tags: ["harmony"] })[0]?.notes).toBe("Voicings felt clean.");
    expect(reloaded.summarize(session.id)).toMatchObject({
      attempts: 1,
      meanScore: 1,
    });
  });

  test("compares this week against last week", () => {
    const sessions = new PracticeSessionStore();
    const lastWeek = sessions.start({
      id: "last-week",
      source: "daily-routine",
      startedAt: unixMs(Date.UTC(2026, 0, 7, 12)),
    });
    sessions.recordScoringEvent(
      lastWeek.id,
      event("event-last", "harmony.ii-v-i", Date.UTC(2026, 0, 7, 12), lastWeek.id, 0.5),
    );
    sessions.finish(lastWeek.id, unixMs(Date.UTC(2026, 0, 7, 12, 20)), 20);

    const thisWeek = sessions.start({
      id: "this-week",
      source: "daily-routine",
      startedAt: unixMs(Date.UTC(2026, 0, 14, 12)),
    });
    sessions.recordScoringEvent(
      thisWeek.id,
      event("event-this-1", "harmony.ii-v-i", Date.UTC(2026, 0, 14, 12), thisWeek.id, 1),
    );
    sessions.recordScoringEvent(
      thisWeek.id,
      event("event-this-2", "rhythm.quarter-pulse", Date.UTC(2026, 0, 14, 12), thisWeek.id, 0.8),
    );
    sessions.finish(thisWeek.id, unixMs(Date.UTC(2026, 0, 14, 12, 20)), 52);

    expect(sessions.compareWeeks(unixMs(Date.UTC(2026, 0, 15)))).toMatchObject({
      thisWeek: { sessionCount: 1, xp: 52, attempts: 2, meanScore: 0.9 },
      lastWeek: { sessionCount: 1, xp: 20, attempts: 1, meanScore: 0.5 },
      delta: { sessionCount: 0, xp: 32, attempts: 1, meanScore: 0.4 },
    });
  });
});

function createStore(): PracticeStore {
  const database = new PracticeDatabase(`practice-sessions-${crypto.randomUUID()}`);
  databases.push(database);
  return new PracticeStore(database);
}
