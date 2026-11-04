import { describe, expect, it } from "vitest";
import {
  gridLines,
  highwayScale,
  judgeHit,
  orderLanes,
  overdue,
  padCell,
  padsDue,
  peaks,
  strokeScore,
  stepsPerBeatFor,
  xAt,
} from "./lanes";

describe("lanes", () => {
  it("orders lanes as drum notation reads, slices after in order", () => {
    expect(orderLanes(["kick", "hats", "snare", "crash"])).toEqual([
      "crash",
      "hats",
      "snare",
      "kick",
    ]);
    expect(orderLanes(["slice-10", "slice-2", "kick", "slice-2"])).toEqual([
      "kick",
      "slice-2",
      "slice-10",
    ]);
  });
});

describe("time to x", () => {
  it("puts the hit line a fixed share in and the look-ahead at the right edge", () => {
    const s = highwayScale(1000, 500, 4, 2);
    expect(s.hitX).toBe(160);
    expect(s.aheadMs).toBe(4000);
    expect(xAt(0, 0, s)).toBe(160);
    expect(xAt(4000, 0, s)).toBeCloseTo(1000);
    expect(xAt(1000, 1000, s)).toBe(160);
    // A note behind the line leaves at the left edge.
    expect(xAt(-s.behindMs, 0, s)).toBeCloseTo(0);
  });

  it("follows the meter: a bar of 7/8 clicks is seven clicks wide", () => {
    const s = highwayScale(1000, 250, 7, 1);
    expect(s.aheadMs).toBe(1750);
  });
});

describe("grid lines", () => {
  it("draws bars, beats and sixteenth steps", () => {
    const lines = gridLines(0, 2000, 500, 4, 4);
    expect(lines).toHaveLength(17);
    expect(lines[0]).toEqual({ ms: 0, kind: "bar", bar: 1 });
    expect(lines[1]).toEqual({ ms: 125, kind: "step" });
    expect(lines[4]).toEqual({ ms: 500, kind: "beat" });
    expect(lines[16]).toEqual({ ms: 2000, kind: "bar", bar: 2 });
  });

  it("splits a click in three for triplets", () => {
    const lines = gridLines(0, 500, 500, 4, 3);
    expect(lines.map((l) => Math.round(l.ms))).toEqual([0, 167, 333, 500]);
    expect(lines.map((l) => l.kind)).toEqual(["bar", "step", "step", "beat"]);
  });

  it("counts odd meters: five clicks a bar", () => {
    const bars = gridLines(0, 5000, 500, 5, 1).filter((l) => l.kind === "bar");
    expect(bars.map((l) => [l.ms, l.bar])).toEqual([
      [0, 1],
      [2500, 2],
      [5000, 3],
    ]);
  });

  it("reads the count-in as the bar before the first", () => {
    const lines = gridLines(-2000, 0, 500, 4, 1);
    expect(lines[0]).toEqual({ ms: -2000, kind: "bar", bar: 0 });
    expect(lines.slice(1, 4).every((l) => l.kind === "beat")).toBe(true);
  });

  it("drops the steps when they would crowd", () => {
    const crowded = gridLines(0, 2000, 500, 4, 4, 0.02);
    expect(crowded.some((l) => l.kind === "step")).toBe(false);
    expect(crowded).toHaveLength(5);
  });

  it("finds the steps a beat that hold every hit", () => {
    expect(stepsPerBeatFor([0, 0.5, 1.25])).toBe(4);
    expect(stepsPerBeatFor([0, 1 / 3, 2 / 3])).toBe(3);
    expect(stepsPerBeatFor([0, 1 / 6, 0.5])).toBe(6);
  });
});

describe("pad grid", () => {
  it("lays out bank A as the MPC: A01 bottom left, A16 top right", () => {
    expect(padCell(36)).toEqual({ row: 3, col: 0 });
    expect(padCell(39)).toEqual({ row: 3, col: 3 });
    expect(padCell(40)).toEqual({ row: 2, col: 0 });
    expect(padCell(51)).toEqual({ row: 0, col: 3 });
    expect(padCell(35)).toBeNull();
    expect(padCell(52)).toBeNull();
  });

  it("lights the pads due from just behind now to the look-ahead", () => {
    const notes = [
      { pad: 36, atMs: 0 },
      { pad: 38, atMs: 250 },
      { pad: 42, atMs: 900 },
    ];
    expect([...padsDue(notes, 10, 300)].sort()).toEqual([36, 38]);
  });
});

describe("live judging", () => {
  const notes = [
    { pad: 36, atMs: 0 },
    { pad: 38, atMs: 500 },
    { pad: 36, atMs: 1000 },
  ];
  const w = { perfect: 25, good: 60 };

  it("judges a hit on the nearest unjudged note of its pad", () => {
    expect(judgeHit(notes, {}, 36, 10, w)).toEqual({ index: 0, err: 10, judgement: "perfect" });
    expect(judgeHit(notes, {}, 38, 460, w)).toEqual({ index: 1, err: -40, judgement: "early" });
    expect(judgeHit(notes, { 0: "perfect" }, 36, 40, w)).toBeNull();
    expect(judgeHit(notes, {}, 36, 1050, w)?.judgement).toBe("late");
    expect(judgeHit(notes, {}, 42, 0, w)).toBeNull();
  });

  it("calls a note missed once the good window has passed", () => {
    expect(overdue(notes, { 0: "perfect" }, 600, 60)).toEqual([1]);
    expect(overdue(notes, {}, 30, 60)).toEqual([]);
  });
});

describe("peaks", () => {
  it("takes the loudest sample per part, the loudest part as 1", () => {
    const data = new Float32Array([0.1, -0.4, 0.2, 0.2, 0, -0.1, 0.8, 0.3]);
    expect(peaks(data, 8, 4)).toEqual([0.5, 0.25, 0.125, 1]);
  });
  it("reads only the loop's length, and stays at 0 for silence", () => {
    expect(peaks(new Float32Array([0.5, 0.5, 1, 1]), 2, 2)).toEqual([1, 1]);
    expect(peaks(new Float32Array(4), 4, 2)).toEqual([0, 0]);
  });
});

describe("strokeScore", () => {
  it("counts timing only for the strokes that landed (4 of 16 is no 48%)", () => {
    const r = { pad: 0.25, timing: 0.9, velocity: null, completion: 0.25 };
    const grader = (0.45 * 0.25 + 0.3 * 0.9 + 0.1 * 0.25) / 0.85;
    const s = strokeScore({ ...r, score: grader });
    expect(s).toBeCloseTo((0.45 * 0.25 + 0.3 * 0.225 + 0.1 * 0.25) / 0.85);
    expect(s).toBeLessThan(0.25);
  });
  it("leaves a run with every stroke landed as the grader scored it", () => {
    expect(
      strokeScore({ score: 0.925, pad: 1, timing: 0.8, velocity: 0.9, completion: 1 }),
    ).toBeCloseTo(0.925, 6);
  });
});
