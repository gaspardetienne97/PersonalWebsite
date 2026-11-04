import { describe, expect, it } from "vite-plus/test";
import type { PracticeSession, RunRecord } from "@repo/music-core";
import { deltaText, metricScore, notMeasuredText, setupTrend, sparkPoints } from "./trend";

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
  it("says the change in the score's unit, from the last run's figure", () => {
    expect(deltaText(0.72, 0.85)).toBe("Up from 72%");
    expect(deltaText(1, 0.22)).toBe("Down from 100%");
    expect(deltaText(0.5, 0.503)).toBe("Same as last time");
    expect(deltaText(0.5, 0.6, false)).toBe("Up on last time");
  });
});

describe("metricScore", () => {
  it("reads a percentage or a count out of a total, nothing else", () => {
    expect(metricScore("85%")).toBe(0.85);
    expect(metricScore("3/4")).toBe(0.75);
    expect(metricScore("23 of 23")).toBe(1);
    expect(metricScore("24")).toBeUndefined();
    expect(metricScore("Not measured")).toBeUndefined();
    expect(metricScore("0/0")).toBeUndefined();
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
