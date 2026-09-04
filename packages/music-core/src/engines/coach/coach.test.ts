import { describe, expect, test } from "vitest";

import { Capability, unixMs, type ScoringEvent } from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { SkillGraphStore, seedCoreSkills } from "@repo/music-core/engines/skills";

import { buildPracticeCoachView } from "./index";

describe("buildPracticeCoachView", () => {
  test("prioritizes weak spots and builds a routine", async () => {
    const skills = new SkillGraphStore();
    const analytics = new AnalyticsEngine();
    const progress = new ProgressEngine();
    await skills.seed(seedCoreSkills());
    await analytics.ingest(event("weak-1", "harmony.seventh.dominant", 0, false));
    await analytics.ingest(event("strong-1", "rhythm.quarter-pulse", 1, true));

    const view = buildPracticeCoachView({
      skills,
      analytics,
      progressState: progress.state,
      sessions: [],
    });

    expect(view.focus?.skillId).toBe("harmony.seventh.dominant");
    expect(view.headline).toContain("Dominant 7th");
    // The weak seventh chord binds to the routine's ear step as its drill deep link.
    expect(view.routine[0]?.href).toBe("/music/learn/ear/chord-qualities");
    expect(view.insights.join(" ")).toContain("0% accuracy");
  });

  test("falls back to a balanced routine with no history", async () => {
    const skills = new SkillGraphStore();
    await skills.seed(seedCoreSkills());

    const view = buildPracticeCoachView({
      skills,
      analytics: new AnalyticsEngine(),
      progressState: new ProgressEngine().state,
      sessions: [],
    });

    expect(view.focus).toBeUndefined();
    expect(view.headline).toBe("Build a balanced routine");
    expect(view.routine.map((step) => step.href)).toEqual([
      "/music/learn/ear/mixed",
      "/music/learn/reading",
      "/music/learn/rhythm",
      "/music/play/scales",
    ]);
  });
});

function event(id: string, skillId: string, partialCredit: number, correct: boolean): ScoringEvent {
  return {
    id,
    sessionId: "coach-test-session",
    exerciseId: "coach-test-exercise",
    skillIds: [skillId],
    capabilities: [skillId.startsWith("rhythm.") ? Capability.Rhythm : Capability.Harmony],
    at: unixMs(Date.UTC(2026, 0, 16)),
    correct,
    partialCredit,
    difficulty: 0.6,
    metrics: [{ kind: "choice", expected: skillId, actual: correct ? skillId : "miss" }],
  };
}
