import { describe, expect, test } from "vitest";

import { Capability, type ScoringEvent, unixMs } from "@repo/music-core/domain";

import { ProgressEngine } from "./index";

const event = (id: string, at: number, score: number): ScoringEvent => ({
  id,
  sessionId: "s",
  exerciseId: "e",
  skillIds: ["pitch.interval.m6"],
  capabilities: [Capability.Pitch],
  at: unixMs(at),
  correct: score >= 0.8,
  partialCredit: score,
  difficulty: 0.5,
  metrics: [],
});

describe("music-core/progress", () => {
  test("awards XP and counts one streak increment per local day", () => {
    const progress = new ProgressEngine();
    progress.ingest(event("a", Date.UTC(2026, 0, 1, 12), 1));
    progress.ingest(event("b", Date.UTC(2026, 0, 1, 13), 1));
    progress.ingest(event("c", Date.UTC(2026, 0, 2, 12), 0.5));

    expect(progress.state.xp).toBeGreaterThan(0);
    expect(progress.state.streakDays).toBe(2);
    expect(progress.state.level).toBeGreaterThanOrEqual(1);
  });
});
