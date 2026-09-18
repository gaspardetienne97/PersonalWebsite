import { Capability, unixMs, type ScoringEvent } from "@repo/music-core/domain";
import { describe, expect, test } from "vitest";

import { DailyRoutineSession, buildDailyRoutinePlan } from "./index";

describe("daily routine", () => {
  test("keeps specific jazz review recommendations in the routine", () => {
    const plan = buildDailyRoutinePlan(
      [
        {
          skillId: "harmony.ii-v-i.chord-scales.minor",
          skillName: "Minor chord-scales",
          href: "/music/play/chord-scales?changes=minor",
        },
      ],
      { instrument: "piano", budgetMinutes: 5 },
    );
    expect(plan[0]?.href).toBe("/music/play/chord-scales?changes=minor&instrument=piano");
  });
  test("fits the available time and rejects recommendations for another instrument", () => {
    const plan = buildDailyRoutinePlan(
      [{ skillId: "piano", skillName: "Piano", href: "/music/play/two-hand" }],
      { instrument: "guitar", budgetMinutes: 10 },
    );
    expect(plan.map((step) => step.id)).toEqual(["spider", "ear"]);
    expect(plan.reduce((sum, step) => sum + step.minutes, 0)).toBeLessThanOrEqual(10);
    expect(plan.every((step) => step.href.includes("instrument=guitar"))).toBe(true);
    const mpc = buildDailyRoutinePlan([], { instrument: "mpc", budgetMinutes: 5 });
    expect(mpc.map((step) => step.id)).toEqual(["mpc"]);
  });
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
        href: "/music/learn/ear/intervals",
      },
      {
        skillId: "harmony.seventh.dominant",
        skillName: "Dominant seventh",
        href: "/music/library?tab=reference",
      },
    ]);

    // A per-drill ear link binds to the single ear step.
    expect(plan.map((step) => step.href)).toEqual([
      "/music/learn/rhythm",
      "/music/learn/ear/intervals",
      "/music/learn/reading",
      "/music/play/scales",
    ]);
    expect(plan[0]?.skillId).toBe("rhythm.pulse.quarter");
  });

  test("can include the ii-V-I voicing drill from harmony weak spots", () => {
    const plan = buildDailyRoutinePlan([
      {
        skillId: "harmony.ii-v-i",
        skillName: "ii-V-I",
        href: "/music/play/voicings",
      },
      {
        skillId: "rhythm.pulse.quarter",
        skillName: "Quarter-note pulse",
        href: "/music/learn/rhythm",
      },
    ]);

    expect(plan.map((step) => step.id)).toEqual(["voicings", "rhythm", "ear", "reading"]);
    expect(plan[0]).toMatchObject({
      label: "ii-V-I Voicings",
      href: "/music/play/voicings",
      skillId: "harmony.ii-v-i",
    });
  });

  test("preserves expanded drill query parameters while filling routine categories", () => {
    const plan = buildDailyRoutinePlan([
      {
        skillId: "technique.mpc.paradiddles",
        skillName: "MPC Paradiddles",
        href: "/music/play/mpc?pattern=paradiddle",
      },
      {
        skillId: "technique.mpc.single-strokes",
        skillName: "MPC Alternating Single Strokes",
        href: "/music/play/mpc",
      },
      {
        skillId: "rhythm.gap-click",
        skillName: "Gap Click Timing",
        href: "/music/learn/rhythm?pattern=gap-click-1-on-1-off",
      },
    ]);

    expect(plan.map((step) => step.href)).toEqual([
      "/music/play/mpc?pattern=paradiddle",
      "/music/learn/rhythm?pattern=gap-click-1-on-1-off",
      "/music/learn/ear/scale-degrees?level=anchor",
      "/music/learn/reading",
    ]);
    expect(plan[0]).toMatchObject({
      id: "mpc",
      skillId: "technique.mpc.paradiddles",
    });
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
