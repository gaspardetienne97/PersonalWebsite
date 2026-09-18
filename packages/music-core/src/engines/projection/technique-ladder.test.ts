import { describe, expect, test } from "vitest";

import type { TechniqueSessionState } from "@repo/music-core/engines/technique-session";

import { tempoLadderProjection, tempoPracticePlan } from "./technique-ladder";

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

test("suggests a higher rung only after a clean run and respects the ladder bounds", () => {
  const options = { startBpm: 60, stepBpm: 20, rungs: 4 };
  expect(tempoPracticePlan(80, false, options)).toMatchObject({ nextBpm: 80, slowerBpm: 60 });
  expect(tempoPracticePlan(80, true, options)).toMatchObject({ nextBpm: 100, slowerBpm: 60 });
  expect(tempoPracticePlan(120, true, options).nextBpm).toBe(120);
  expect(tempoPracticePlan(60, false, options).slowerBpm).toBe(60);
  expect(tempoPracticePlan(80, false, options).rungs.find((rung) => rung.bpm === 80)?.status).toBe(
    "target",
  );
});
