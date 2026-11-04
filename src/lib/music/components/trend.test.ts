import { describe, expect, it } from "vite-plus/test";
import type { PracticeSession, RunRecord } from "@repo/music-core";
import { deltaText, notMeasuredText, setupTrend, sparkPoints } from "./trend";

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

describe("deltaText", () => {
  it("says the change in points, with its sign", () => {
    expect(deltaText(12.4)).toBe("+12 points vs last time");
    expect(deltaText(-60)).toBe("-60 points vs last time");
    expect(deltaText(1)).toBe("+1 point vs last time");
    expect(deltaText(0.3)).toBe("Same as last time");
  });
});

describe("notMeasuredText", () => {
  it("lists the unmeasured rows on one line", () => {
    expect(notMeasuredText(["Timing", "Early or late"])).toBe(
      "Not measured: timing, early or late",
    );
    expect(notMeasuredText(["MIDI velocity"])).toBe("Not measured: MIDI velocity");
    expect(notMeasuredText(["Velocity", "Rising: velocity not measured"])).toBe(
      "Not measured: velocity; rising: velocity not measured",
    );
  });
});
