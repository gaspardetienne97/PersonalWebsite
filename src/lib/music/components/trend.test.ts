import { describe, expect, it } from "vite-plus/test";
import type { PracticeSession, RunRecord } from "@repo/music-core";
import {
  deltaLine,
  deltaText,
  metricScore,
  pipsText,
  priorBest,
  scoreTone,
  setupTrend,
  starKey,
  starsFor,
  starsLabel,
  unmeasuredLine,
  VERDICT_WORDS,
  verdictWord,
} from "./trend";

const run = (
  exerciseId: string,
  setupKey: string,
  endedAt: number,
  score?: number,
  instrument?: string,
) =>
  ({
    id: `${exerciseId}${endedAt}`,
    exerciseId,
    setupKey,
    endedAt,
    score,
    instrument,
  }) as RunRecord;
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
  it("never compares a setup across instruments", () => {
    const s = sessions(
      run("scale", "C", 1000, 0.99, "piano"),
      run("scale", "C", 2000, 0.6, "guitar"),
      run("scale", "C", 3000, 0.7, "guitar"),
    );
    expect(setupTrend(s, 4000)).toEqual([0.6, 0.7]);
    expect(priorBest(s, 4000)).toBe(0.6);
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

describe("deltaText", () => {
  it("says the change in the score's unit, from the last run's figure", () => {
    expect(deltaText(0.72, 0.85)).toBe("Up from 72%");
    expect(deltaText(1, 0.22)).toBe("Last time: 100%");
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
  it("reads the other languages' forms, so the score ring fills in every language", () => {
    expect(metricScore("85\u00a0%")).toBe(0.85);
    expect(metricScore("85 %")).toBe(0.85);
    expect(metricScore("3 de 4")).toBe(0.75);
    expect(metricScore("3 sur 4")).toBe(0.75);
    expect(metricScore("3 sou 4")).toBe(0.75);
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
  it("draws stars on the score, the third only for the rule's pass", () => {
    expect(starsFor(undefined, true)).toBeNull();
    expect(starsFor(0.21, false)).toBe(0);
    expect(starsFor(0.69, false)).toBe(0);
    expect(starsFor(0.7, false)).toBe(1);
    expect(starsFor(0.84, true)).toBe(1);
    // 9 of 10 right in a quiz that passes only at every answer right: a good run, not a clean one.
    expect(starsFor(0.9, false)).toBe(2);
    expect(starsFor(1, false)).toBe(2);
    expect(starsFor(0.9, true)).toBe(3);
    expect(starsFor(1, true)).toBe(3);
    expect(VERDICT_WORDS[starsFor(0.9, false)!]).toBe("Good run");
  });
  it("tones the ring on the same lines as the stars", () => {
    for (const s of [0.2, 0.69, 0.7, 0.84, 0.85, 0.9, 1]) {
      const stars = starsFor(s, false)!;
      expect(scoreTone(s)).toBe(stars >= 2 ? "success" : stars === 1 ? "warn" : "error");
    }
  });
  it("says what the stars mean and what the next one takes", () => {
    expect(starsLabel(2)).toBe("2 of 3 stars: 85% or better");
    // A pass the rule counts with a miss in it keeps its stars but is not called clean.
    expect(verdictWord(3, 0.9)).toBe("Clean run");
    expect(verdictWord(3, 0.996)).toBe("Perfect run!");
    expect(verdictWord(2, 0.9)).toBe("Good run");
    expect(starKey(0)).toBe("Next star: 70%");
    expect(starKey(1)).toBe("Next star: 85%");
    expect(starKey(2, "every answer right")).toBe("Next star: every answer right");
    expect(starKey(2)).toBe("Next star: a clean run");
    // No key at three stars: it read as the run's result.
    expect(starKey(3, "9 of 10 right or better")).toBeNull();
    expect(VERDICT_WORDS[1]).toBe("Nearly there");
  });
});

describe("unmeasuredLine", () => {
  it("folds the rows the input cannot measure into one line, keeping reasoned rows out", () => {
    expect(
      unmeasuredLine([
        { label: "Notes", text: "8 of 8" },
        { label: "Which string each note came from", notMeasured: true },
        { label: "Tone cleanliness", notMeasured: true },
        { label: "Timing", notMeasured: true, text: "too few notes landed to judge" },
      ]),
    ).toBe("Not measured with this input: which string each note came from, tone cleanliness.");
    expect(unmeasuredLine([{ label: "Timing", notMeasured: true, text: "too few" }])).toBeNull();
    expect(
      unmeasuredLine([
        { label: "Dynamics, melody louder", notMeasured: true },
        { label: "MIDI velocity", notMeasured: true },
      ]),
    ).toBe("Not measured with this input: dynamics, melody louder; MIDI velocity.");
  });
});

describe("pipsText", () => {
  it("counts clean runs toward the next step, in the rule's words once it moves", () => {
    expect(pipsText({ kind: "same", passes: 1, need: 2, reason: "", bpm: 80 })).toBe(
      "Clean runs: 1 of 2 to move on",
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
      text: "Last time: 70%",
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
