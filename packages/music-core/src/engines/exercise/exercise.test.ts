import { describe, expect, test } from "vitest";

import {
  Capability,
  discreteRun,
  monotonicMs,
  unixMs,
  type ExerciseDefinition,
  type ScoringEvent,
} from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { SkillGraphStore, seedCoreSkills } from "@repo/music-core/engines/skills";

import {
  ExerciseRegistry,
  ExerciseRunHost,
  ExerciseScheduler,
  runExerciseThroughPipeline,
} from "./index";
import { intervalRecognitionExercise } from "@repo/music-core/exercises/interval-recognition";
import { createRhythmPulseExercise } from "@repo/music-core/exercises/rhythm-pulse";

function scoringEvent(
  id: string,
  skillId: string,
  score: number,
  at = 1_700_000_000_000,
): ScoringEvent {
  return {
    id,
    sessionId: "session-1",
    exerciseId: `exercise.${skillId}`,
    skillIds: [skillId],
    capabilities: [Capability.Pitch],
    at: unixMs(at),
    correct: score >= 0.8,
    partialCredit: score,
    difficulty: 0.6,
    metrics: [],
  };
}

function exercise(id: string, skillId: string, capability: Capability): ExerciseDefinition {
  return {
    id,
    name: id,
    capabilities: [capability],
    skillIds: [skillId],
    inputs: ["onscreen"],
    streaming: false,
    generate: () => ({ id: `${id}.prompt`, payload: undefined }),
    createRun: () =>
      discreteRun((input) => ({
        correct: true,
        score: 1,
        metrics: [],
        feedback: [],
        input,
      })),
  };
}

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

  test("builds an interleaved queue around weak skills with adaptive difficulty", async () => {
    const registry = new ExerciseRegistry();
    registry.register(exercise("exercise.weak", "pitch.interval.m6", Capability.Pitch));
    registry.register(exercise("exercise.strong", "reading.treble.landmarks", Capability.Reading));
    registry.register(exercise("exercise.rhythm", "rhythm.quarter-pulse", Capability.Rhythm));
    const skills = new SkillGraphStore();
    await skills.seed(seedCoreSkills());
    const analytics = new AnalyticsEngine();

    for (let index = 0; index < 4; index += 1) {
      await analytics.ingest(scoringEvent(`weak-${index}`, "pitch.interval.m6", 0));
      await analytics.ingest(scoringEvent(`strong-${index}`, "reading.treble.landmarks", 1));
      await analytics.ingest(scoringEvent(`rhythm-${index}`, "rhythm.quarter-pulse", 0.75));
    }

    const queue = new ExerciseScheduler(registry, skills, analytics).buildQueue({
      length: 6,
      now: unixMs(1_700_000_100_000),
    });

    expect(queue).toHaveLength(6);
    expect(queue[0]).toMatchObject({
      exerciseId: "exercise.weak",
      targetSkillIds: ["pitch.interval.m6"],
    });
    expect(queue.find((item) => item.exerciseId === "exercise.weak")?.difficulty).toBeLessThan(
      queue.find((item) => item.exerciseId === "exercise.strong")?.difficulty ?? 0,
    );
    expect(
      queue.every((item, index) => index === 0 || item.exerciseId !== queue[index - 1]!.exerciseId),
    ).toBe(true);
  });

  test("prioritizes an overdue review over a recently practiced skill", async () => {
    const registry = new ExerciseRegistry();
    registry.register(exercise("exercise.recent", "pitch.interval.m6", Capability.Pitch));
    registry.register(exercise("exercise.overdue", "reading.treble.landmarks", Capability.Reading));
    const skills = new SkillGraphStore();
    await skills.seed(seedCoreSkills());

    await skills.ingest(
      scoringEvent("overdue", "reading.treble.landmarks", 1, Date.UTC(2026, 0, 1)),
    );
    await skills.ingest(scoringEvent("recent", "pitch.interval.m6", 1, Date.UTC(2026, 0, 10)));

    const queue = new ExerciseScheduler(registry, skills, new AnalyticsEngine()).buildQueue({
      length: 2,
      now: unixMs(Date.UTC(2026, 0, 11)),
    });

    expect(queue[0]?.exerciseId).toBe("exercise.overdue");
  });

  test("streams routed input into live state and finishes through the learning pipeline", async () => {
    const router = new InputRouter({ now: () => 0 });
    const skills = new SkillGraphStore();
    await skills.seed(seedCoreSkills());
    const analytics = new AnalyticsEngine();
    const progress = new ProgressEngine();
    const host = new ExerciseRunHost(
      router,
      { skills, analytics, progress },
      {
        now: () => 1_700_000_000_000,
        makeId: () => "stream-event",
      },
    );

    host.start({
      exercise: createRhythmPulseExercise({ bpm: 120, beats: 2 }),
      sessionId: "session-1",
      runId: "run-1",
      context: { targetSkillIds: ["rhythm.quarter-pulse"], difficulty: 0.7 },
    });
    expect(host.liveState?.progress).toBe(0);

    router.noteOn(36, "click", "mpc");
    expect(host.liveState?.progress).toBe(0);
    router.noteOn(36, "onscreen", "mpc");
    expect(host.liveState?.progress).toBe(0.5);
    router.push({
      type: "noteOn",
      midiNote: 36,
      velocity: 1,
      source: "onscreen",
      instrument: "mpc",
      timestamp: monotonicMs(500),
      clock: "performance",
    });
    expect(host.liveState?.progress).toBe(1);

    const outcome = await host.finish();

    expect(outcome.event).toMatchObject({
      id: "stream-event",
      skillIds: ["rhythm.quarter-pulse"],
      difficulty: 0.7,
      correct: true,
    });
    expect(skills.getMastery("rhythm.quarter-pulse").mastery).toBeGreaterThan(0);
    expect(analytics.getStats("rhythm.quarter-pulse")?.attempts).toBe(1);
    expect(outcome.xp).toBeGreaterThan(0);
    host.dispose();
  });
});
