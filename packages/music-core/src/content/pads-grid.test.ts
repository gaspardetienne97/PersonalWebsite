import { describe, expect, it } from "vitest";
import { canSwing, gridGroove, grooveMeter, reswing, swungBeat } from "./pads-grid";

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

describe("triplet and odd-meter grids", () => {
  it("reads twelve steps a bar as eighth triplets and twenty-four as sixteenth triplets", () => {
    const g = gridGroove("shuffle", "Shuffle", { hats: "x.xx.xx.xx.x", snare: "...X.....X.." });
    expect(g.stepsPerBeat).toBe(3);
    expect(g.beatsPerBar).toBeUndefined();
    const hats = g.targets.filter((t) => t.voice === "hats").map((t) => t.beat);
    expect(hats.slice(0, 4).map((b) => +b.toFixed(3))).toEqual([0, 0.667, 1, 1.667]);
    expect(g.targets.filter((t) => t.voice === "snare").map((t) => t.beat)).toEqual([1, 3]);
    const six = gridGroove("six", "Six", { snare: "x.....x.....x.....x....x" });
    expect(six.stepsPerBeat).toBe(6);
    expect(six.targets.at(-1)!.beat).toBeCloseTo(23 / 6);
    expect(grooveMeter(six)).toBe("4/4");
    expect(() => gridGroove("bad", "Bad", { hats: "x.xx.xx.xx.x" }, { swing: 60 })).toThrow(
      /triplet/,
    );
  });

  it("puts 5/4, 7/4 and 7/8 bars end to end and names the meter", () => {
    const five = gridGroove(
      "5",
      "Five",
      { kick: "X...........X.......|X..................." },
      { beats: 5 },
    );
    expect(five.beatsPerBar).toBe(5);
    expect(five.targets.map((t) => t.beat)).toEqual([0, 3, 5]);
    expect(grooveMeter(five)).toBe("5/4");
    const seven8 = gridGroove("78", "Seven", { kick: "X.......x....." }, { beats: 7 });
    expect(seven8.stepsPerBeat).toBe(2);
    expect(seven8.targets.map((t) => t.beat)).toEqual([0, 4]);
    expect(grooveMeter(seven8)).toBe("7/8");
    expect(grooveMeter(gridGroove("b", "Blues", { hats: "xxxxxxxxxxxx" }, { meter: "12/8" }))).toBe(
      "12/8",
    );
    expect(() => gridGroove("bad", "Bad", { kick: "X.........." }, { beats: 5 })).toThrow(
      /do not split/,
    );
  });

  it("reswings a straight or swung groove, and leaves grooves off the grid alone", () => {
    const straight = gridGroove("s", "S", { hats: "xxxxxxxxxxxxxxxx" });
    expect(canSwing(straight)).toBe(true);
    const at66 = reswing(straight, 50, 66);
    expect(at66.targets[1].beat).toBeCloseTo(0.33);
    expect(at66.targets[2].beat).toBe(0.5);
    const back = reswing(gridGroove("w", "W", { hats: "xxxxxxxxxxxxxxxx" }, { swing: 62 }), 62, 50);
    expect(back.targets.map((t) => t.beat)).toEqual(straight.targets.map((t) => t.beat));
    const shuffle = gridGroove("t", "T", { hats: "x.xx.xx.xx.x" });
    expect(canSwing(shuffle)).toBe(false);
    expect(reswing(shuffle, 50, 66)).toBe(shuffle);
    const pushed = {
      ...straight,
      targets: [{ voice: "snare" as const, beat: 0.97, accent: "normal" as const }],
    };
    expect(canSwing(pushed)).toBe(false);
  });
});
