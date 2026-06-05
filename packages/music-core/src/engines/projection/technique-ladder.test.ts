import { describe, expect, test } from "vitest";

import type { TechniqueSessionState } from "@repo/music-core/engines/technique-session";

import { tempoLadderProjection } from "./technique-ladder";

describe("tempoLadderProjection", () => {
  test("marks rungs as unlocked, target, or locked", () => {
    const state = {
      status: "summary",
      highestUnlockedBpm: 110,
      nextTargetBpm: 120,
      results: [],
    } as unknown as TechniqueSessionState;

    const ladder = tempoLadderProjection(state, { startBpm: 100, stepBpm: 10, rungs: 4 });
    expect(ladder.map((rung) => rung.bpm)).toEqual([100, 110, 120, 130]);
    expect(ladder.find((rung) => rung.bpm === 100)?.status).toBe("unlocked");
    expect(ladder.find((rung) => rung.bpm === 110)?.status).toBe("unlocked");
    expect(ladder.find((rung) => rung.bpm === 120)?.status).toBe("target");
    expect(ladder.find((rung) => rung.bpm === 130)?.status).toBe("locked");
  });
});
