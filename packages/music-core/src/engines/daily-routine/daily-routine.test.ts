import { Capability, unixMs, type ScoringEvent } from "@repo/music-core/domain";
import { describe, expect, test } from "vitest";

import { DailyRoutineSession, buildDailyRoutinePlan } from "./index";

describe("daily routine", () => {
  test("orders playable drills from practice-next picks and fills missing categories", () => {
    const plan = buildDailyRoutinePlan([
      {
        skillId: "rhythm.pulse.quarter",
        skillName: "Quarter-note pulse",
        href: "/music/learn/rhythm",
      },
      {
        skillId: "pitch.interval.m6",
        skillName: "Minor sixth",
        href: "/music/learn/ear",
      },
      {
        skillId: "harmony.seventh.dominant",
        skillName: "Dominant seventh",
        href: "/music/learn/theory",
      },
    ]);

    expect(plan.map((step) => step.href)).toEqual([
      "/music/learn/rhythm",
      "/music/learn/ear",
      "/music/learn/reading",
      "/music/play/scales",
    ]);
    expect(plan[0]?.skillId).toBe("rhythm.pulse.quarter");
  });

  test("advances from real drill captures and builds a combined summary", () => {
    const plan = buildDailyRoutinePlan([]).slice(0, 2);
    const routine = new DailyRoutineSession(plan);

    routine.start("routine-1", unixMs(1_000));
    expect(routine.state.status).toBe("active");
    expect(routine.state.currentStep?.id).toBe("ear");

    routine.completeCurrent(
      {
        scoringEvents: [event("ear-1", 0.75)],
        xpEarned: 12,
        note: "Ear training complete",
      },
      unixMs(2_000),
    );

    expect(routine.state.status).toBe("active");
    expect(routine.state.currentStep?.id).toBe("reading");
    expect(routine.state.steps[0]?.status).toBe("completed");

    routine.completeCurrent(
      {
        scoringEvents: [event("reading-1", 1), event("reading-2", 0.5)],
        xpEarned: 18,
        note: "Reading complete",
      },
      unixMs(4_000),
    );

    expect(routine.state.status).toBe("summary");
    expect(routine.state.summary).toMatchObject({
      completedSteps: 2,
      totalSteps: 2,
      totalXp: 30,
      accuracy: 0.75,
      durationMs: 3_000,
    });
    expect(routine.state.summary?.scoringEvents).toHaveLength(3);
  });
});

function event(id: string, partialCredit: number): ScoringEvent {
  return {
    id,
    sessionId: "drill-session",
    exerciseId: "test.exercise",
    skillIds: ["pitch.interval.m6"],
    capabilities: [Capability.EarTraining],
    at: unixMs(1_500),
    correct: partialCredit === 1,
    partialCredit,
    difficulty: 0.5,
    metrics: [],
  };
}
