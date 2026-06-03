import { describe, expect, test } from "vitest";

import { Capability, type ScoringEvent, unixMs } from "@repo/music-core/domain";

import { AnalyticsEngine } from "./index";

describe("music-core/analytics", () => {
  test("tracks confusion and ranks weak skills", () => {
    const analytics = new AnalyticsEngine();
    const base: Omit<ScoringEvent, "id" | "correct" | "partialCredit" | "metrics"> = {
      sessionId: "session-1",
      exerciseId: "ear.interval",
      skillIds: ["pitch.interval.m6"],
      capabilities: [Capability.Pitch],
      at: unixMs(1),
      difficulty: 0.6,
    };

    analytics.ingest({
      ...base,
      id: "wrong",
      correct: false,
      partialCredit: 0,
      metrics: [{ kind: "choice", expected: "m6", actual: "P5" }],
    });
    analytics.ingest({
      ...base,
      id: "right",
      correct: true,
      partialCredit: 1,
      metrics: [{ kind: "choice", expected: "m6", actual: "m6" }],
    });

    expect(analytics.confusions("m6")).toEqual({ P5: 1, m6: 1 });
    expect(analytics.weakestSkills(1)[0]?.skillId).toBe("pitch.interval.m6");
  });
});
