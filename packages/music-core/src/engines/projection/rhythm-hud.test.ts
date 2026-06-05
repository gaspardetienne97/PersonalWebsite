import { describe, expect, test } from "vitest";

import type { RhythmSessionState } from "@repo/music-core/engines/rhythm-session";

import { rhythmHudProjection } from "./rhythm-hud";

describe("rhythmHudProjection", () => {
  test("projects live progress and running score while active", () => {
    const state = {
      status: "active",
      live: { progress: 0.5, runningScore: 0.8, feedback: [] },
      results: [],
    } as unknown as RhythmSessionState;

    const hud = rhythmHudProjection(state);
    expect(hud.progressPct).toBe(50);
    expect(hud.runningScorePct).toBe(80);
    expect(hud.offsetMs).toBe(0);
  });

  test("projects offset and accuracy from the completed summary", () => {
    const state = {
      status: "summary",
      results: [],
      summary: {
        total: 8,
        correct: 7,
        accuracy: 0.875,
        xp: 120,
        meanSignedErrorMs: 4,
        meanAbsoluteErrorMs: 9,
        results: [],
      },
    } as unknown as RhythmSessionState;

    const hud = rhythmHudProjection(state);
    expect(hud.offsetMs).toBe(4);
    expect(hud.avgAbsOffsetMs).toBe(9);
    expect(hud.accuracyPct).toBe(88);
    expect(hud.progressPct).toBe(100);
  });
});
