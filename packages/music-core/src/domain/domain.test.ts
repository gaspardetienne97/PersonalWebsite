import { describe, expect, test } from "vitest";

import {
  Capability,
  applyScoringEventToSkillState,
  initialMastery,
  resultToScoringEvent,
  scoringEventToEvidence,
  updateConfusion,
  unixMs,
  type ConfusionMatrix,
  type SkillMastery,
} from "./index";

describe("domain learning pipeline", () => {
  test("moves mastery and records m6/P5 confusion on the canonical path", () => {
    let mastery = new Map<string, SkillMastery>([
      ["pitch.interval.m6", initialMastery("pitch.interval.m6")],
    ]);
    const confusion: ConfusionMatrix = new Map();

    const event = resultToScoringEvent({
      result: {
        correct: false,
        score: 0,
        metrics: [{ kind: "choice", expected: "m6", actual: "P5" }],
        feedback: [],
        input: [],
      },
      sessionId: "session-1",
      runId: "run-1",
      exercise: {
        id: "ear.interval-recognition",
        skillIds: ["pitch.interval.m6"],
        capabilities: [Capability.EarTraining, Capability.Pitch],
      },
      prompt: { id: "prompt-1" },
      at: unixMs(1_700_000_000_000),
      difficulty: 0.6,
      modality: "heard",
      makeId: () => "event-1",
    });

    expect(scoringEventToEvidence(event)).toHaveLength(1);
    mastery = applyScoringEventToSkillState(mastery, event, initialMastery);
    updateConfusion(confusion, event);

    expect(mastery.get("pitch.interval.m6")?.confidence).toBeGreaterThan(0);
    expect(mastery.get("pitch.interval.m6")?.mastery).toBe(0);
    expect(confusion.get("m6")?.get("P5")).toBe(1);
  });
});
