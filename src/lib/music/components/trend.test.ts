import { describe, expect, it } from "vite-plus/test";
import type { PracticeSession, RunRecord } from "@repo/music-core";
import {
  deltaLine,
  deltaText,
  metricScore,
  pipsText,
  priorBest,
  setupTrend,
  sparkPoints,
  starsFor,
  starsLabel,
} from "./trend";

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

describe("priorBest", () => {
  it("is the best score with this setup before the newest run", () => {
    const s = sessions(
      run("a", "x", 1000, 0.9),
      run("a", "y", 2000, 1),
      run("a", "x", 3000, 0.6),
      run("a", "x", 4000, 0.95),
    );
    expect(priorBest(s, 5000)).toBe(0.9);
    expect(priorBest(sessions(run("a", "x", 1000, 0.5)), 2000)).toBeUndefined();
  });
});

describe("starsFor", () => {
  it("draws stars on the advance rule's lines only", () => {
    expect(starsFor(undefined, true)).toBeNull();
    expect(starsFor(0.69, false)).toBe(0);
    expect(starsFor(0.7, false)).toBe(1);
    // 90% without the drill's own pass is close, not a pass.
    expect(starsFor(0.9, false)).toBe(1);
    expect(starsFor(0.9, true)).toBe(2);
    expect(starsFor(0.996, true)).toBe(3);
    expect(starsFor(1, false)).toBe(1);
  });
  it("says what the stars mean", () => {
    expect(starsLabel(2)).toBe("2 of 3 stars: a pass at 85% or better");
  });
});

describe("pipsText", () => {
  it("counts clean runs toward the next step, in the rule's words once it moves", () => {
    expect(pipsText({ kind: "same", passes: 1, need: 2, reason: "", bpm: 80 })).toBe(
      "Clean runs: 1 of 2 to speed up",
    );
    expect(pipsText({ kind: "same", passes: 0, need: 2, reason: "" })).toBe(
      "Clean runs: 0 of 2 to move on",
    );
    expect(
      pipsText({ kind: "faster", passes: 2, need: 2, reason: "2 clean runs at 80 BPM", bpm: 84 }),
    ).toBe("2 clean runs at 80 BPM: speeding up next");
  });
});

describe("deltaLine", () => {
  it("reads the same runs as the sparkline", () => {
    expect(deltaLine({ trend: [0.5, 0.7], delta: 0, score: 0.7 })).toEqual({
      text: "Up from 50%",
      up: true,
      best: false,
    });
    expect(deltaLine({ trend: [0.7], delta: -10, score: 0.6 })).toEqual({
      text: "Down from 70%",
      up: false,
      best: false,
    });
    expect(deltaLine({ trend: [], score: 0.6 })).toBeNull();
  });
  it("names the old best, and drops a best that is not up in whole percents", () => {
    expect(deltaLine({ trend: [0.8, 0.9], best: true, priorBest: 0.85, score: 0.9 })).toEqual({
      text: "New best, up from 85%",
      up: true,
      best: true,
    });
    expect(
      deltaLine({ trend: [0.871, 0.873], best: true, priorBest: 0.871, score: 0.873 }),
    ).toEqual({
      text: "Same as last time",
      up: false,
      best: false,
    });
  });
});
