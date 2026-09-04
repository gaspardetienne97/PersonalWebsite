import { describe, expect, test } from "vitest";

import {
  builtEarTrainingCapabilities,
  currentEarTrainingLearningPath,
  EAR_TRAINING_CAPABILITIES,
  EAR_TRAINING_LEARNING_PATH,
  EAR_TRAINING_LEARNING_PATH_DEFINITION,
  earTrainingDrillBySlug,
} from "./index";

describe("ear-training curriculum", () => {
  test("keeps functional scale-degree recognition as the curriculum spine", () => {
    expect(EAR_TRAINING_LEARNING_PATH.map(({ id }) => id).slice(0, 3)).toEqual([
      "anchor-tonic",
      "diatonic-degrees",
      "sing-and-play-back",
    ]);
    expect(EAR_TRAINING_LEARNING_PATH[1]).toMatchObject({
      recommendedDrill: "scale-degree",
      currentSupport: "built",
    });
    expect(EAR_TRAINING_LEARNING_PATH[0]).toMatchObject({
      id: "anchor-tonic",
      currentSupport: "built",
    });
    expect(EAR_TRAINING_LEARNING_PATH[2]).toMatchObject({
      id: "sing-and-play-back",
      currentSupport: "built",
    });
  });

  test("treats interval recognition as support instead of the beginner path", () => {
    const intervalStage = EAR_TRAINING_LEARNING_PATH.find(
      ({ id }) => id === "harmony-and-interval-labels",
    );
    expect(intervalStage?.order).toBeGreaterThan(4);
    expect(EAR_TRAINING_LEARNING_PATH[0]?.recommendedDrill).toBe("scale-degree");
  });

  test("reports current built capabilities separately from planned upgrades", () => {
    expect(builtEarTrainingCapabilities().map(({ id }) => id)).toEqual([
      "scale-degree-function",
      "drone-free-play",
      "degree-set-levels",
      "chromatic-color",
      "adaptive-mixed-review",
      "pocket-mode",
      "voice-mode",
      "melody-dictation-transfer",
      "repertoire-transfer",
      "chord-quality-support",
      "interval-label-support",
    ]);
    expect(EAR_TRAINING_CAPABILITIES.some(({ status }) => status === "planned")).toBe(false);
    expect(EAR_TRAINING_LEARNING_PATH.find(({ id }) => id === "chromatic-color")).toMatchObject({
      currentSupport: "built",
      recommendedDrill: "scale-degree",
    });
    expect(
      EAR_TRAINING_LEARNING_PATH.find(({ id }) => id === "melody-transfer")?.practiceMode,
    ).toContain("repertoire");
  });

  test("every stage links a known drill route with skills behind it", () => {
    for (const stage of EAR_TRAINING_LEARNING_PATH) {
      expect(stage.href).toMatch(/^\/music\/learn\/ear\/[a-z-]+/);
      expect(
        earTrainingDrillBySlug(new URL(stage.href!, "http://x").pathname.split("/").at(-1)),
      ).toBeDefined();
      expect(stage.skillIds?.length).toBeGreaterThan(0);
      expect(stage.summary.length).toBeGreaterThan(0);
      expect(stage.detail.length).toBeGreaterThan(0);
    }
    expect(EAR_TRAINING_LEARNING_PATH[0]?.href).toBe(
      "/music/learn/ear/scale-degrees?answer=listen&level=anchor",
    );
    expect(EAR_TRAINING_LEARNING_PATH.at(-1)).toMatchObject({
      kind: "review",
      href: "/music/learn/ear/mixed",
    });
    expect(EAR_TRAINING_LEARNING_PATH_DEFINITION.steps).toBe(EAR_TRAINING_LEARNING_PATH);
  });

  test("returns defensive copies for route projections", () => {
    const path = currentEarTrainingLearningPath();
    path[0]!.title = "Mutated";

    expect(currentEarTrainingLearningPath()[0]?.title).toBe("Anchor the tonic");
  });
});
