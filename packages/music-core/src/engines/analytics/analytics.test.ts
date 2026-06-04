import { afterEach, describe, expect, test } from "vitest";

import { Capability, type ScoringEvent, unixMs } from "@repo/music-core/domain";
import { PracticeDatabase, PracticeStore } from "@repo/music-core/engines/store";

import { AnalyticsEngine } from "./index";

const databases: PracticeDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.map((database) => database.delete()));
  databases.length = 0;
});

function createStore(): PracticeStore {
  const database = new PracticeDatabase(`analytics-${crypto.randomUUID()}`);
  databases.push(database);
  return new PracticeStore(database);
}

function choiceEvent(id: string, skillId: string, expected: string, actual: string): ScoringEvent {
  const correct = expected === actual;
  return {
    id,
    sessionId: "session-1",
    exerciseId: "ear.interval",
    skillIds: [skillId],
    capabilities: [Capability.Pitch],
    at: unixMs(1_700_000_000_000 + Number(id.replace(/\D/g, "")) * 1_000),
    correct,
    partialCredit: correct ? 1 : 0,
    difficulty: 0.6,
    metrics: [{ kind: "choice", expected, actual }],
  };
}

describe("music-core/analytics", () => {
  test("reports the pipeline-trace substitution by skill and ranks the weak skill", async () => {
    const analytics = new AnalyticsEngine();
    const traceAnswers = ["P5", "P5", "P5", "P5", "m6", "m6", "m6", "m6"];

    for (const [index, answer] of traceAnswers.entries()) {
      await analytics.ingest(choiceEvent(`m6-${index}`, "pitch.interval.m6", "m6", answer));
    }
    for (let index = 0; index < 4; index += 1) {
      await analytics.ingest(choiceEvent(`P5-${index}`, "pitch.interval.P5", "P5", "P5"));
    }

    expect(analytics.confusions("pitch.interval.m6")).toEqual({ P5: 4, m6: 4 });
    expect(analytics.weakestSkills(1)[0]?.skillId).toBe("pitch.interval.m6");
  });

  test("persists events incrementally and restores derived analytics", async () => {
    const store = createStore();
    const analytics = new AnalyticsEngine(store);

    await analytics.ingest(choiceEvent("wrong-1", "pitch.interval.m6", "m6", "P5"));
    await analytics.ingest(choiceEvent("right-2", "pitch.interval.m6", "m6", "m6"));

    const reloaded = new AnalyticsEngine(store);
    await reloaded.load();

    expect(reloaded.confusions("pitch.interval.m6")).toEqual({ P5: 1, m6: 1 });
    expect(reloaded.weakestSkills(1)[0]).toMatchObject({
      skillId: "pitch.interval.m6",
      attempts: 2,
      accuracy: 0.5,
      meanScore: 0.5,
    });
  });

  test("derives per-skill accuracy, reaction time, chord-switch speed, and consistency", async () => {
    const analytics = new AnalyticsEngine();
    const base: Omit<ScoringEvent, "id" | "correct" | "partialCredit" | "latencyMs"> = {
      sessionId: "session-1",
      exerciseId: "harmony.chord-switch",
      skillIds: ["harmony.ii-v-i"],
      capabilities: [Capability.Harmony],
      at: unixMs(1_700_000_000_000),
      difficulty: 0.6,
      metrics: [
        {
          kind: "chord",
          expectedPitchClasses: [0, 4, 7],
          actualPitchClasses: [0, 4, 7],
        },
      ],
    };

    await analytics.ingest({
      ...base,
      id: "chord-1",
      correct: true,
      partialCredit: 1,
      latencyMs: 1_200,
    });
    await analytics.ingest({
      ...base,
      id: "chord-2",
      correct: false,
      partialCredit: 0,
      latencyMs: 800,
    });

    expect(analytics.getStats("harmony.ii-v-i")).toMatchObject({
      attempts: 2,
      correctAttempts: 1,
      accuracy: 0.5,
      meanScore: 0.5,
      meanReactionTimeMs: 1_000,
      chordSwitchSpeedMs: 1_000,
      consistency: 0,
    });
  });

  test("excludes attempts without latency from timing averages", async () => {
    const analytics = new AnalyticsEngine();
    const event = choiceEvent("choice-1", "harmony.ii-v-i", "ii-V-I", "ii-V-I");
    await analytics.ingest(event);
    await analytics.ingest({
      ...event,
      id: "chord-2",
      latencyMs: 1_200,
      metrics: [{ kind: "chord", expectedPitchClasses: [2, 7, 0], actualPitchClasses: [2, 7, 0] }],
    });
    await analytics.ingest({
      ...event,
      id: "chord-3",
      latencyMs: 800,
      metrics: [{ kind: "chord", expectedPitchClasses: [2, 7, 0], actualPitchClasses: [2, 7, 0] }],
    });

    expect(analytics.getStats("harmony.ii-v-i")).toMatchObject({
      attempts: 3,
      meanReactionTimeMs: 1_000,
      chordSwitchSpeedMs: 1_000,
    });
  });
});
