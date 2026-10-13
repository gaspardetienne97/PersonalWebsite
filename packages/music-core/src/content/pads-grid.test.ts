import { describe, expect, it } from "vitest";
import { gridGroove, swungBeat } from "./pads-grid";

describe("drum grids", () => {
  it("reads accents, normal hits and ghosts on sixteenths", () => {
    const g = gridGroove("t", "Test", {
      kick: "X.......x.......",
      snare: "....X..g....X...",
    });
    expect(g.bars).toBe(1);
    expect(g.targets.map((t) => `${t.voice}@${t.beat}:${t.accent}`)).toEqual([
      "kick@0:accent",
      "snare@1:accent",
      "snare@1.75:ghost",
      "kick@2:normal",
      "snare@3:accent",
    ]);
  });

  it("swings the off-sixteenths: straight at 50, on the triplet at 66", () => {
    expect([0, 1, 2, 3].map((i) => swungBeat(i))).toEqual([0, 0.25, 0.5, 0.75]);
    expect(swungBeat(1, 66)).toBeCloseTo(0.33);
    expect(swungBeat(3, 66)).toBeCloseTo(0.83);
  });

  it("refuses a lane of the wrong length", () => {
    expect(() => gridGroove("bad", "Bad", { kick: "X..." })).toThrow(/4 steps/);
    expect(() =>
      gridGroove("bad", "Bad", {
        kick: "X...............|X...............",
        snare: "................",
      }),
    ).toThrow(/1 bars/);
  });
});
