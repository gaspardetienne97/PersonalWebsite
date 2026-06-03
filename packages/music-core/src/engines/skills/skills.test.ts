import { describe, expect, test } from "vitest";

import { Capability, resultToScoringEvent, unixMs } from "@repo/music-core/domain";

import { SkillGraphStore, seedCoreSkills } from "./index";

describe("music-core/skills", () => {
  test("seeding is idempotent and ingest moves mastery through the domain pipeline", async () => {
    const graph = new SkillGraphStore();
    await graph.seed(seedCoreSkills());
    await graph.seed(seedCoreSkills());
    expect(graph.skills.length).toBe(seedCoreSkills().skills.length);

    const event = resultToScoringEvent({
      result: {
        correct: true,
        score: 1,
        metrics: [{ kind: "choice", expected: "m6", actual: "m6" }],
        feedback: [],
        input: [],
      },
      sessionId: "session-1",
      runId: "run-1",
      exercise: {
        id: "ear.interval",
        skillIds: ["pitch.interval.m6"],
        capabilities: [Capability.Pitch],
      },
      prompt: { id: "prompt-1" },
      at: unixMs(1_700_000_000_000),
      difficulty: 0.6,
      modality: "heard",
      makeId: () => "event-1",
    });

    await graph.ingest(event);
    expect(graph.getMastery("pitch.interval.m6").mastery).toBeGreaterThan(0);
  });
});
