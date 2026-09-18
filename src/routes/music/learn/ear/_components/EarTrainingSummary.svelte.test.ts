import { afterEach, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import type { EarTrainingSummary as Summary } from "@repo/music-core/engines/ear-training";
import { createIntervalRecognitionExercise } from "@repo/music-core/exercises/interval-recognition";
import { createChordQualityRecognitionExercise } from "@repo/music-core/exercises/chord-quality-recognition";
import EarTrainingSummary from "./EarTrainingSummary.svelte";

afterEach(() => document.body.replaceChildren());

test("uses musical choice labels and degree names in confusion summaries", () => {
  const context = { targetSkillIds: ["harmony.seventh.major"], difficulty: 0.8 };
  const summary: Summary = {
    total: 2,
    correct: 0,
    accuracy: 0,
    xp: 0,
    streakDays: 0,
    byDrill: {},
    recentResults: [
      createIntervalRecognitionExercise(),
      createChordQualityRecognitionExercise(),
    ].map((exercise) => {
      const prompt = exercise.generate(context).payload;
      return { drill: prompt.drill, prompt, result: { correct: false } };
    }) as Summary["recentResults"],
    confusions: [
      { drill: "interval", expected: "M3", actual: "m3", count: 1 },
      { drill: "chord-quality", expected: "major-7", actual: "minor-7", count: 1 },
      { drill: "melody-dictation", expected: "1", actual: "b3", count: 1 },
    ],
  };
  render(EarTrainingSummary, { summary });
  expect(document.body.textContent).toContain("Major 3rd → Minor 3rd");
  expect(document.body.textContent).toContain("Major 7th → Minor 7th");
  expect(document.body.textContent).toContain("1 / do → b3 / me");
});
