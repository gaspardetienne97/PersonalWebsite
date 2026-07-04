import { afterEach, describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { Capability, unixMs, type ScoringEvent } from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import type { DailyRoutineState } from "@repo/music-core/engines/daily-routine";
import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";

import NextUpSuggestion from "./NextUpSuggestion.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

const weakEvent = (id: string, skillId: string): ScoringEvent => ({
  id,
  sessionId: "session-1",
  exerciseId: "exercise-1",
  skillIds: [skillId],
  capabilities: [Capability.Technique],
  at: unixMs(Date.UTC(2026, 0, 10)),
  correct: false,
  partialCredit: 0,
  difficulty: 0.5,
  metrics: [],
});

async function engines(weakSkillId: string) {
  const skills = new SkillGraphStore();
  const analytics = new AnalyticsEngine();
  await skills.seed(seedCoreSkills());
  await analytics.ingest(weakEvent("weak-1", weakSkillId));
  return { skills, analytics };
}

describe("NextUpSuggestion", () => {
  test("suggests the weakest skill at its own drill", async () => {
    const { skills, analytics } = await engines("technique.strings.spider");
    render(NextUpSuggestion, { skills, analytics, currentPath: "/music/learn/rhythm" });

    const card = document.querySelector('[data-testid="next-up"]');
    expect(card?.textContent).toContain("Next up");
    expect(card?.textContent).toContain("Chromatic Spider Drill");
    expect(card?.querySelector("a")?.getAttribute("href")).toBe("/music/play/spider");
  });

  test("never suggests the drill that was just finished", async () => {
    const { skills, analytics } = await engines("technique.strings.spider");
    render(NextUpSuggestion, { skills, analytics, currentPath: "/music/play/spider" });

    const card = document.querySelector('[data-testid="next-up"]');
    // Either a different pick or nothing — but not the spider drill itself.
    expect(card?.querySelector("a")?.getAttribute("href") ?? "").not.toBe("/music/play/spider");
  });

  test("stays silent while a routine owns the next step", async () => {
    const { skills, analytics } = await engines("technique.strings.spider");
    const routine = { status: "active" } as DailyRoutineState;
    render(NextUpSuggestion, {
      skills,
      analytics,
      currentPath: "/music/learn/rhythm",
      routine,
    });

    expect(document.querySelector('[data-testid="next-up"]')).toBeNull();
  });

  test("renders nothing for a fresh profile with no weak spots", async () => {
    const skills = new SkillGraphStore();
    const analytics = new AnalyticsEngine();
    await skills.seed(seedCoreSkills());
    render(NextUpSuggestion, { skills, analytics, currentPath: "/music/learn/rhythm" });

    expect(document.querySelector('[data-testid="next-up"]')).toBeNull();
  });
});
