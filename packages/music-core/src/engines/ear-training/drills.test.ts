import { describe, expect, test } from "vitest";

import {
  clampEarAnswerMode,
  EAR_TRAINING_DRILLS,
  earTrainingDrillBySlug,
  earTrainingDrillHref,
  earTrainingHrefForSkill,
  legacyEarTrainingHref,
  scaleDegreeSkillIds,
} from "./drills";

describe("ear training drill definitions", () => {
  test("every drill has a unique slug and a default answer mode", () => {
    const slugs = EAR_TRAINING_DRILLS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain("mixed");
    for (const drill of EAR_TRAINING_DRILLS) expect(drill.answerModes.length).toBeGreaterThan(0);
    expect(earTrainingDrillBySlug("mixed")?.title).toBe("Ear training review");
    expect(earTrainingDrillBySlug("nope")).toBeUndefined();
  });

  test("builds hrefs with only the parameters the drill uses", () => {
    expect(earTrainingDrillHref("intervals")).toBe("/music/learn/ear/intervals");
    expect(earTrainingDrillHref("intervals", { level: "anchor", labels: "solfege" })).toBe(
      "/music/learn/ear/intervals",
    );
    expect(earTrainingDrillHref("scale-degrees", { answer: "listen", level: "anchor" })).toBe(
      "/music/learn/ear/scale-degrees?answer=listen&level=anchor",
    );
    expect(earTrainingDrillHref("cadences", { answer: "play-back" })).toBe(
      "/music/learn/ear/cadences?answer=choice",
    );
    expect(earTrainingDrillHref("mixed", { routine: true })).toBe(
      "/music/learn/ear/mixed?routine=1",
    );
  });

  test("clamps answer modes to what the drill supports", () => {
    const melody = earTrainingDrillBySlug("melody-dictation")!;
    expect(clampEarAnswerMode(melody, "choice")).toBe("play-back");
    expect(clampEarAnswerMode(earTrainingDrillBySlug("scale-degrees")!, "voice")).toBe("voice");
    expect(clampEarAnswerMode(earTrainingDrillBySlug("intervals")!, undefined)).toBe("choice");
  });

  test("maps legacy single-route links onto the drill routes", () => {
    expect(legacyEarTrainingHref("?drill=cadence&answer=listen")).toBe(
      "/music/learn/ear/cadences?answer=listen",
    );
    expect(legacyEarTrainingHref("drill=scale-degree&level=chromatic-color&bpm=90")).toBe(
      "/music/learn/ear/scale-degrees?level=chromatic-color&bpm=90",
    );
    expect(legacyEarTrainingHref("?routine=1")).toBe("/music/learn/ear/mixed?routine=1");
    expect(legacyEarTrainingHref("?drill=mixed")).toBe("/music/learn/ear/mixed");
    expect(legacyEarTrainingHref("")).toBeUndefined();
    expect(legacyEarTrainingHref("?drill=bogus")).toBeUndefined();
  });

  test("routes skills to the drill that practises them", () => {
    expect(earTrainingHrefForSkill("ear.cadences.plagal")).toBe("/music/learn/ear/cadences");
    expect(earTrainingHrefForSkill("pitch.interval.M3")).toBe("/music/learn/ear/intervals");
    expect(earTrainingHrefForSkill("pitch.scale-degree.b3")).toBe("/music/learn/ear/scale-degrees");
    expect(earTrainingHrefForSkill("harmony.seventh.dominant")).toBe(
      "/music/learn/ear/chord-qualities",
    );
    expect(earTrainingHrefForSkill("harmony.ii-v-i")).toBe("/music/learn/ear/mixed");
    expect(earTrainingHrefForSkill("rhythm.swing")).toBeUndefined();
  });

  test("expands a scale-degree level into its skill ids", () => {
    expect(scaleDegreeSkillIds("anchor")).toEqual(["pitch.scale-degree.1", "pitch.scale-degree.5"]);
    expect(scaleDegreeSkillIds("chromatic-color")).toHaveLength(12);
  });
});
