import { describe, expect, test, vi } from "vitest";

import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import {
  ExerciseRegistry,
  ExerciseScheduler,
  type ScheduledExercise,
  type PipelineServices,
} from "@repo/music-core/engines/exercise";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { SkillGraphStore, seedCoreSkills } from "@repo/music-core/engines/skills";
import { cadenceRecognitionExercise } from "@repo/music-core/exercises/cadence-recognition";
import { chordQualityRecognitionExercise } from "@repo/music-core/exercises/chord-quality-recognition";
import { intervalRecognitionExercise } from "@repo/music-core/exercises/interval-recognition";
import {
  melodyDictationExercise,
  type MelodyDictationPrompt,
} from "@repo/music-core/exercises/melody-dictation";
import { scaleDegreeRecognitionExercise } from "@repo/music-core/exercises/scale-degree-recognition";
import type { ScaleDegreeRecognitionPrompt } from "@repo/music-core/exercises/scale-degree-recognition";

import {
  buildEarTrainingRetrySchedule,
  EarTrainingSession,
  normalizeEarTrainingConfig,
} from "./index";
import { buildRepertoireEarTransfers, createRepertoireTransferExercise } from "./repertoire";

async function setup() {
  const router = new InputRouter({ now: () => 0 });
  const registry = new ExerciseRegistry();
  registry.register(intervalRecognitionExercise);
  registry.register(chordQualityRecognitionExercise);
  registry.register(cadenceRecognitionExercise);
  registry.register(scaleDegreeRecognitionExercise);
  registry.register(melodyDictationExercise);
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

describe("normalizeEarTrainingConfig", () => {
  test("normalizes shareable ear-training config values", () => {
    const params = new URLSearchParams(
      "drill=scale-degree&answer=play-back&feedback=test&level=chromatic-color",
    );

    expect(normalizeEarTrainingConfig(params)).toEqual({
      drill: "scale-degree",
      answerMode: "play-back",
      feedbackMode: "test",
      scaleDegreeSet: "chromatic-color",
      scaleDegreeLabelMode: "degree",
    });

    expect(normalizeEarTrainingConfig(new URLSearchParams("drill=cadence"))).toEqual({
      drill: "cadence",
      answerMode: "choice",
      feedbackMode: "practice",
      scaleDegreeSet: "anchor",
      scaleDegreeLabelMode: "degree",
    });

    expect(normalizeEarTrainingConfig(new URLSearchParams("labels=solfege"))).toEqual({
      drill: "mixed",
      answerMode: "choice",
      feedbackMode: "practice",
      scaleDegreeSet: "anchor",
      scaleDegreeLabelMode: "solfege",
    });

    expect(
      normalizeEarTrainingConfig({
        drill: "unsupported",
        answer: "tap",
        feedback: "quiz",
        level: "unknown",
      }),
    ).toEqual({
      drill: "mixed",
      answerMode: "choice",
      feedbackMode: "practice",
      scaleDegreeSet: "anchor",
      scaleDegreeLabelMode: "degree",
    });
  });
});

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
      new Set(["interval", "chord-quality", "scale-degree", "cadence"]),
    );

    focused.dispose();
    mixed.dispose();
  });

  test("builds adaptive mixed queues from weakness and review priorities without drill repeats", async () => {
    const dependencies = await setup();
    const scheduled: ScheduledExercise[] = [
      scheduledEar("ear.scale-degree-recognition", "pitch.scale-degree.b7", "weakness"),
      scheduledEar("ear.chord-quality-recognition", "harmony.seventh.dominant", "review"),
      scheduledEar("ear.interval-recognition", "pitch.interval.m6", "new"),
      scheduledEar("ear.scale-degree-recognition", "pitch.scale-degree.3", "review"),
      scheduledEar("ear.chord-quality-recognition", "harmony.triad.minor", "weakness"),
      scheduledEar("ear.interval-recognition", "pitch.interval.P5", "review"),
    ];
    const session = new EarTrainingSession(
      {
        ...dependencies,
        scheduler: {
          buildQueue: () => scheduled,
        } as unknown as ExerciseScheduler,
      },
      {
        drill: "mixed",
        answerMode: "choice",
        feedbackMode: "practice",
        length: 6,
        queueMode: "adaptive",
      },
    );

    expect(session.queue.map(({ drill }) => drill)).toEqual([
      "scale-degree",
      "chord-quality",
      "interval",
      "scale-degree",
      "chord-quality",
      "interval",
    ]);
    expect(session.queue.map(({ reason }) => reason)).toEqual([
      "weakness",
      "review",
      "new",
      "review",
      "weakness",
      "review",
    ]);
    expect(
      session.queue.every(
        (item, index, queue) => index === 0 || item.drill !== queue[index - 1]!.drill,
      ),
    ).toBe(true);
    session.dispose();
  });

  test("filters scale-degree session queues to the selected degree set", async () => {
    const dependencies = await setup();
    const session = new EarTrainingSession(dependencies, {
      drill: "scale-degree",
      answerMode: "choice",
      feedbackMode: "practice",
      length: 4,
      scaleDegreeSet: "anchor",
    });

    expect(new Set(session.queue.map(({ targetSkillId }) => targetSkillId))).toEqual(
      new Set(["pitch.scale-degree.1", "pitch.scale-degree.5"]),
    );
    session.dispose();
  });

  test("passes solfege label mode into scale-degree prompts", async () => {
    const dependencies = await setup();
    const session = new EarTrainingSession(dependencies, {
      drill: "scale-degree",
      answerMode: "choice",
      feedbackMode: "practice",
      length: 1,
      scaleDegreeSet: "anchor",
      scaleDegreeLabelMode: "solfege",
    });

    const prompt = await session.start();

    expect((prompt as ScaleDegreeRecognitionPrompt).labelMode).toBe("solfege");
    expect(prompt.choices).toEqual([
      { token: "1", label: "do" },
      { token: "5", label: "sol" },
    ]);
    session.dispose();
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

  test("advances listening-only self-assessments through the scoring pipeline", async () => {
    const dependencies = await setup();
    const session = new EarTrainingSession(dependencies, {
      drill: "interval",
      answerMode: "listen",
      feedbackMode: "practice",
      length: 2,
    });
    const firstPrompt = await session.start();

    await expect(session.answerListening(true)).rejects.toThrow("Replay the prompt");
    session.replay();
    await session.answerListening(true);

    expect(session.state.currentIndex).toBe(1);
    expect(session.state.results[0]).toMatchObject({
      targetSkillId: firstPrompt.targetSkillId,
      result: {
        correct: true,
        answer: firstPrompt.answerToken,
      },
    });
    expect(
      dependencies.services.skills.getMastery(firstPrompt.targetSkillId).mastery,
    ).toBeGreaterThan(0);

    const secondPrompt = session.replay();
    await session.answerListening(false);

    expect(session.state.status).toBe("summary");
    expect(session.state.summary).toMatchObject({
      total: 2,
      correct: 1,
    });
    expect(session.state.summary?.confusions[0]).toMatchObject({
      expected: secondPrompt.answerToken,
    });
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
      expect.arrayContaining(["interval", "chord-quality", "scale-degree", "cadence"]),
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

  test("publishes state after a microphone voice answer completes", async () => {
    const dependencies = await setup();
    const session = new EarTrainingSession(dependencies, {
      drill: "scale-degree",
      answerMode: "voice",
      feedbackMode: "practice",
      length: 1,
      scaleDegreeSet: "anchor",
    });
    let latest = session.state;
    const unsubscribe = session.subscribe((state) => {
      latest = state;
    });
    const prompt = await session.start();
    const scalePrompt = prompt as unknown as ScaleDegreeRecognitionPrompt;
    session.replay();

    dependencies.router.noteOn(scalePrompt.tonicMidi + scalePrompt.semitones, "audio");

    await vi.waitFor(() => expect(latest.status).toBe("summary"));
    expect(latest.results[0]?.result.correct).toBe(true);
    unsubscribe();
    session.dispose();
  });

  test("publishes state after a melody dictation play-back answer completes", async () => {
    const dependencies = await setup();
    const session = new EarTrainingSession(dependencies, {
      drill: "melody-dictation",
      answerMode: "play-back",
      feedbackMode: "practice",
      length: 1,
      scaleDegreeSet: "anchor",
    });
    let latest = session.state;
    const unsubscribe = session.subscribe((state) => {
      latest = state;
    });
    const prompt = (await session.start()) as MelodyDictationPrompt;
    session.replay();

    for (const midiNote of prompt.targetMidiNotes) {
      dependencies.router.noteOn(midiNote, "onscreen");
    }

    await vi.waitFor(() => expect(latest.status).toBe("summary"));
    expect(latest.results[0]?.result.correct).toBe(true);
    expect(latest.results[0]?.drill).toBe("melody-dictation");
    unsubscribe();
    session.dispose();
  });

  test("summarizes phrase mistakes as scale-degree confusions for repertoire review", async () => {
    const dependencies = await setup();
    const [transfer] = buildRepertoireEarTransfers(
      {
        id: "score-1",
        title: "Transfer Study",
        origin: "generated",
        keySignature: "C",
        tempoMap: [{ atBeat: 0, bpm: 120 }],
        timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
        voices: [{ id: "melody", name: "Melody", role: "melody" }],
        notes: [60, 62, 64, 67].map((midiNote, index) => ({
          midiNote,
          startBeat: index,
          durationBeats: 1,
          velocity: 0.8,
          voiceId: "melody",
        })),
        chords: [],
        sections: [],
        markers: [],
      },
      { phraseLength: 4 },
    );
    const exercise = createRepertoireTransferExercise(transfer!);
    dependencies.registry.register(exercise);
    const session = new EarTrainingSession(
      {
        ...dependencies,
        scheduler: {
          buildQueue: () => [
            {
              exerciseId: exercise.id,
              targetSkillIds: [...exercise.skillIds],
              difficulty: 0.5,
              reason: "review",
            },
          ],
        } as unknown as ExerciseScheduler,
      },
      {
        drill: "repertoire-transfer",
        answerMode: "play-back",
        feedbackMode: "practice",
        length: 1,
      },
    );
    let latest = session.state;
    const unsubscribe = session.subscribe((state) => {
      latest = state;
    });
    await session.start();
    session.replay();

    for (const midiNote of [60, 62, 62, 67]) {
      dependencies.router.noteOn(midiNote, "onscreen");
    }

    await vi.waitFor(() => expect(latest.status).toBe("summary"));
    expect(latest.summary?.confusions).toContainEqual({
      drill: "repertoire-transfer",
      expected: "3",
      actual: "2",
      count: 1,
    });
    expect(latest.results[0]?.targetSkillId).toBe("pitch.scale-degree.1");
    expect(latest.results[0]?.targetSkillIds).toEqual([
      "pitch.scale-degree.1",
      "pitch.scale-degree.2",
      "pitch.scale-degree.3",
      "pitch.scale-degree.5",
    ]);
    expect(buildEarTrainingRetrySchedule(latest.summary!)).toEqual([
      {
        exerciseId: "ear.scale-degree-recognition",
        targetSkillIds: ["pitch.scale-degree.3"],
        difficulty: 0.5,
        reason: "weakness",
      },
    ]);
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

function scheduledEar(
  exerciseId: ScheduledExercise["exerciseId"],
  skillId: string,
  reason: ScheduledExercise["reason"],
): ScheduledExercise {
  return {
    exerciseId,
    targetSkillIds: [skillId],
    difficulty: reason === "new" ? 0.4 : reason === "review" ? 0.6 : 0.35,
    reason,
  };
}
