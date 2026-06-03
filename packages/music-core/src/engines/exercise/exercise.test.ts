import { describe, expect, test } from "vitest";

import { monotonicMs } from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { SkillGraphStore, seedCoreSkills } from "@repo/music-core/engines/skills";

import { ExerciseRegistry, runExerciseThroughPipeline } from "./index";
import { intervalRecognitionExercise } from "@repo/music-core/exercises/interval-recognition";

describe("music-core/exercise", () => {
  test("runs an exercise through scoring, skill mastery, analytics, and XP", async () => {
    const registry = new ExerciseRegistry();
    registry.register(intervalRecognitionExercise);

    const skills = new SkillGraphStore();
    await skills.seed(seedCoreSkills());
    const analytics = new AnalyticsEngine();
    const progress = new ProgressEngine();

    const outcome = await runExerciseThroughPipeline({
      exercise: registry.get("ear.interval-recognition"),
      input: [
        {
          type: "noteOn",
          midiNote: 0,
          velocity: 1,
          source: "click",
          timestamp: monotonicMs(0),
          clock: "performance",
          raw: { midiData1: 8 },
        },
      ],
      services: { skills, analytics, progress },
      sessionId: "session-1",
      runId: "run-1",
      now: () => 1_700_000_000_000,
    });

    expect(outcome.event.correct).toBe(true);
    expect(skills.getMastery("pitch.interval.m6").mastery).toBeGreaterThan(0);
    expect(progress.state.xp).toBeGreaterThan(0);
  });
});
