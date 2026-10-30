import { describe, expect, it } from "vite-plus/test";
import type { PracticeSession, RunRecord } from "@repo/music-core";
import { setupTrend, sparkPoints } from "./trend";

const run = (exerciseId: string, setupKey: string, endedAt: number, score?: number) =>
  ({ id: `${exerciseId}${endedAt}`, exerciseId, setupKey, endedAt, score }) as RunRecord;
const sessions = (...runs: RunRecord[]) => [{ runs }] as unknown as PracticeSession[];

describe("setupTrend", () => {
  it("lists the scores with the newest run's setup, oldest first", () => {
    const s = sessions(
      run("a", "x", 1000, 0.4),
      run("a", "y", 2000, 0.9),
      run("b", "x", 3000, 0.1),
      run("a", "x", 4000, 0.7),
    );
    expect(setupTrend(s, 5000)).toEqual([0.4, 0.7]);
  });
  it("keeps the last n", () => {
    const s = sessions(...[1, 2, 3, 4].map((i) => run("a", "x", i * 1000, i / 10)));
    expect(setupTrend(s, 5000, 2)).toEqual([0.3, 0.4]);
  });
  it("is empty when the newest run is stale or has no score", () => {
    expect(setupTrend(sessions(run("a", "x", 1000, 0.5)), 60_000)).toEqual([]);
    expect(setupTrend(sessions(run("a", "x", 1000, 0.5), run("a", "x", 2000)), 3000)).toEqual([]);
    expect(setupTrend([], 0)).toEqual([]);
  });
});

describe("sparkPoints", () => {
  it("spreads the runs across the width, 100% at the top", () => {
    expect(sparkPoints([0, 1], 10, 4)).toEqual([
      [0, 4],
      [10, 0],
    ]);
    expect(sparkPoints([0.5], 10, 4)).toEqual([[5, 2]]);
  });
});
