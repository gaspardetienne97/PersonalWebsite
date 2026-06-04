import { afterEach, describe, expect, test } from "vitest";

import { Capability, type ScoringEvent, unixMs } from "@repo/music-core/domain";
import { SkillGraphStore, seedCoreSkills } from "@repo/music-core/engines/skills";
import { PracticeDatabase, PracticeStore } from "@repo/music-core/engines/store";

import { ProgressEngine } from "./index";

const databases: PracticeDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.map((database) => database.delete()));
  databases.length = 0;
});

function createStore(): PracticeStore {
  const database = new PracticeDatabase(`progress-${crypto.randomUUID()}`);
  databases.push(database);
  return new PracticeStore(database);
}

const event = (
  id: string,
  at: number,
  score: number,
  difficulty = 0.5,
  skillId = "pitch.interval.m6",
): ScoringEvent => ({
  id,
  sessionId: "s",
  exerciseId: "e",
  skillIds: [skillId],
  capabilities: [Capability.Pitch],
  at: unixMs(at),
  correct: score >= 0.8,
  partialCredit: score,
  difficulty,
  metrics: [],
});

describe("music-core/progress", () => {
  test("awards XP for difficulty and improvement without double-counting events", async () => {
    const progress = new ProgressEngine();
    const baseline = await progress.ingest(event("a", Date.UTC(2026, 0, 1), 0.4, 0.5));
    const improved = await progress.ingest(event("b", Date.UTC(2026, 0, 1, 1), 0.8, 0.5));
    const harder = await progress.ingest(
      event("c", Date.UTC(2026, 0, 1, 2), 0.8, 0.9, "pitch.interval.P5"),
    );
    const duplicate = await progress.ingest(event("c", Date.UTC(2026, 0, 1, 2), 0.8, 0.9));

    expect(improved).toBeGreaterThan(baseline);
    expect(harder).toBeGreaterThan(baseline);
    expect(duplicate).toBe(0);
  });

  test("counts UTC practice days once and consumes a freeze to bridge a missed day", async () => {
    const progress = new ProgressEngine();
    await progress.grantStreakFreeze();

    await progress.ingest(event("a", Date.UTC(2026, 0, 1, 23, 59), 1));
    await progress.ingest(event("b", Date.UTC(2026, 0, 1, 23, 59, 59), 1));
    await progress.ingest(event("c", Date.UTC(2026, 0, 3, 0, 1), 1));

    expect(progress.state).toMatchObject({
      streakDays: 3,
      practicedDays: ["2026-01-01", "2026-01-03"],
      frozenDays: ["2026-01-02"],
      streakFreezes: 0,
    });
  });

  test("persists progress and reloads it from the practice store", async () => {
    const store = createStore();
    const progress = new ProgressEngine(store);

    await progress.grantStreakFreeze(2);
    await progress.ingest(event("a", Date.UTC(2026, 0, 1), 1));

    const reloaded = new ProgressEngine(store);
    await reloaded.load();

    expect(reloaded.state).toEqual(progress.state);
    expect(reloaded.state.xp).toBeGreaterThan(0);
  });

  test("unlocks achievements from skill-graph mastery milestones", async () => {
    const skills = new SkillGraphStore();
    await skills.seed(seedCoreSkills());
    const progress = new ProgressEngine();

    for (let index = 0; index < 6; index += 1) {
      const attempt = event(`correct-${index}`, Date.UTC(2026, 0, index + 1), 1);
      await skills.ingest(attempt);
      await progress.ingest(attempt, skills);
    }

    expect(progress.state.achievements).toEqual(
      expect.arrayContaining(["first-skill-50", "first-skill-mastered"]),
    );
  });
});
