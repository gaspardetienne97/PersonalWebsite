import { describe, expect, test, vi } from "vitest";

import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import {
  ExerciseRegistry,
  ExerciseScheduler,
  type PipelineServices,
} from "@repo/music-core/engines/exercise";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { SkillGraphStore, seedCoreSkills } from "@repo/music-core/engines/skills";
import { chordQualityRecognitionExercise } from "@repo/music-core/exercises/chord-quality-recognition";
import { intervalRecognitionExercise } from "@repo/music-core/exercises/interval-recognition";
import { scaleDegreeRecognitionExercise } from "@repo/music-core/exercises/scale-degree-recognition";
import type { ScaleDegreeRecognitionPrompt } from "@repo/music-core/exercises/scale-degree-recognition";

import { EarTrainingSession } from "./index";

async function setup() {
  const router = new InputRouter({ now: () => 0 });
  const registry = new ExerciseRegistry();
  registry.register(intervalRecognitionExercise);
  registry.register(chordQualityRecognitionExercise);
  registry.register(scaleDegreeRecognitionExercise);
  const skills = new SkillGraphStore();
  await skills.seed(seedCoreSkills());
  const services: PipelineServices = {
    skills,
    analytics: new AnalyticsEngine(),
    progress: new ProgressEngine(),
  };
  let id = 0;

  return {
    router,
    registry,
    services,
    scheduler: new ExerciseScheduler(registry, skills, services.analytics),
    makeId: () => `event-${++id}`,
  };
}

describe("EarTrainingSession", () => {
  test("builds varied focused queues and balanced mixed queues", async () => {
    const dependencies = await setup();
    const focused = new EarTrainingSession(dependencies, {
      drill: "interval",
      answerMode: "choice",
      feedbackMode: "practice",
    });
    const mixed = new EarTrainingSession(dependencies, {
      drill: "mixed",
      answerMode: "choice",
      feedbackMode: "practice",
    });

    expect(focused.queue).toHaveLength(10);
    expect(focused.queue.every((item) => item.drill === "interval")).toBe(true);
    expect(new Set(focused.queue.map((item) => item.targetSkillId)).size).toBeGreaterThan(1);
    expect(new Set(mixed.queue.map((item) => item.drill))).toEqual(
      new Set(["interval", "chord-quality", "scale-degree"]),
    );

    focused.dispose();
    mixed.dispose();
  });

  test("requires replay, advances choice answers, and exposes Practice feedback", async () => {
    const dependencies = await setup();
    const session = new EarTrainingSession(dependencies, {
      drill: "interval",
      answerMode: "choice",
      feedbackMode: "practice",
      length: 2,
    });
    const prompt = await session.start();

    await expect(session.answerChoice(prompt.answerToken)).rejects.toThrow("Replay the prompt");
    expect(session.replay()).toBe(prompt);
    await session.answerChoice(prompt.answerToken);

    expect(session.state.currentIndex).toBe(1);
    expect(session.state.results).toHaveLength(1);
    expect(session.state.feedback[0]?.severity).toBe("good");
    expect(dependencies.services.skills.getMastery(prompt.targetSkillId).mastery).toBeGreaterThan(
      0,
    );
    expect(dependencies.services.analytics.getStats(prompt.targetSkillId)?.attempts).toBe(1);
    expect(dependencies.services.progress.state.xp).toBeGreaterThan(0);
    session.dispose();
  });

  test("defers Test feedback and summarizes ten prompts", async () => {
    const dependencies = await setup();
    const session = new EarTrainingSession(dependencies, {
      drill: "mixed",
      answerMode: "choice",
      feedbackMode: "test",
    });
    await session.start();

    for (let index = 0; index < 10; index += 1) {
      const prompt = session.replay();
      const answer =
        index === 0
          ? prompt.choices.find(({ token }) => token !== prompt.answerToken)!.token
          : prompt.answerToken;
      await session.answerChoice(answer);
      expect(session.state.feedback).toEqual([]);
    }

    expect(session.state.status).toBe("summary");
    expect(session.state.summary).toMatchObject({
      total: 10,
      correct: 9,
    });
    expect(session.state.summary?.xp).toBeGreaterThan(0);
    expect(Object.keys(session.state.summary?.byDrill ?? {})).toEqual(
      expect.arrayContaining(["interval", "chord-quality", "scale-degree"]),
    );
    expect(session.state.summary?.recentResults).toHaveLength(10);
    expect(session.state.summary?.confusions).toHaveLength(1);
    session.dispose();
  });

  test("publishes state after a musical play-back answer completes", async () => {
    const dependencies = await setup();
    const session = new EarTrainingSession(dependencies, {
      drill: "scale-degree",
      answerMode: "play-back",
      feedbackMode: "practice",
      length: 1,
    });
    let latest = session.state;
    const unsubscribe = session.subscribe((state) => {
      latest = state;
    });
    const prompt = await session.start();
    const scalePrompt = prompt as unknown as ScaleDegreeRecognitionPrompt;
    session.replay();

    dependencies.router.noteOn(scalePrompt.tonicMidi + scalePrompt.semitones, "onscreen");

    await vi.waitFor(() => expect(latest.status).toBe("summary"));
    expect(latest.results[0]?.result.correct).toBe(true);
    unsubscribe();
    session.dispose();
  });

  test("keeps the active prompt available when completed-answer persistence fails", async () => {
    const dependencies = await setup();
    vi.spyOn(dependencies.services.analytics, "ingest").mockRejectedValueOnce(
      new Error("Persistence unavailable"),
    );
    const session = new EarTrainingSession(dependencies, {
      drill: "interval",
      answerMode: "choice",
      feedbackMode: "practice",
      length: 1,
    });
    const prompt = await session.start();
    session.replay();

    await expect(session.answerChoice(prompt.answerToken)).rejects.toThrow(
      "Persistence unavailable",
    );
    expect(session.state).toMatchObject({
      status: "active",
      currentIndex: 0,
      currentPrompt: prompt,
      error: "Persistence unavailable",
    });

    await session.answerChoice(prompt.answerToken);
    expect(session.state.status).toBe("summary");
    session.dispose();
  });
});
