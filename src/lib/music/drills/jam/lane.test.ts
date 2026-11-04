import { describe, expect, it } from "vitest";
import { chordToneNames, formPosition, laneBlocks, laneScale } from "./lane";

// ii-V-I-VI: a bar each in 4/4.
const four = [4, 4, 4, 4];

describe("laneBlocks", () => {
  it("lights the chord under the playhead and the one after it", () => {
    const blocks = laneBlocks(four, 5, 4, 8);
    expect(blocks.map((b) => [b.key, b.state])).toEqual([
      ["0:0", "past"],
      ["0:1", "now"],
      ["0:2", "next"],
      ["0:3", "later"],
    ]);
    expect(blocks[1]).toMatchObject({ index: 1, start: 4, beats: 4 });
  });

  it("repeats the form into the next chorus, so the turnaround slides into the top", () => {
    const blocks = laneBlocks(four, 14, 2, 8);
    expect(blocks.map((b) => [b.key, b.start, b.state])).toEqual([
      ["0:3", 12, "now"],
      ["1:0", 16, "next"],
      ["1:1", 20, "later"],
    ]);
  });

  it("starts a chord on its first beat and keeps lengths in beats", () => {
    // A half-bar chord between two whole ones.
    const blocks = laneBlocks([4, 2, 2, 4], 4, 0, 3);
    expect(blocks.map((b) => [b.index, b.start, b.beats, b.state])).toEqual([
      [1, 4, 2, "now"],
      [2, 6, 2, "next"],
    ]);
  });

  it("shows nothing before the first chorus and makes the first chord next in the count-in", () => {
    const blocks = laneBlocks(four, -3, 4, 6);
    expect(blocks.map((b) => [b.key, b.state])).toEqual([["0:0", "next"]]);
  });

  it("is empty for an empty form", () => {
    expect(laneBlocks([], 0, 4, 4)).toEqual([]);
  });
});

it("places a chord in a later chorus from the top of the run", () => {
  expect(formPosition(four, 1, 0)).toBe(0);
  expect(formPosition(four, 1, 2)).toBe(8);
  expect(formPosition(four, 3, 1)).toBe(36);
});

it("scales a beat to the lane width within bounds", () => {
  expect(laneScale(300)).toEqual({ pxPerBeat: 18, playheadX: 66 });
  expect(laneScale(120).pxPerBeat).toBe(18);
  // A laptop stage (about 950 px) shows the chord now and the next five bars or so.
  expect(laneScale(950).pxPerBeat).toBe(34);
  expect(laneScale(1400).pxPerBeat).toBe(44);
});

it("spells the chord's own tones from the root", () => {
  expect(chordToneNames("G7")).toEqual([
    { label: "R", name: "G" },
    { label: "3", name: "B" },
    { label: "5", name: "D" },
    { label: "b7", name: "F" },
  ]);
  expect(chordToneNames("Dm7b5").map((t) => t.name)).toEqual(["D", "F", "Ab", "C"]);
  expect(chordToneNames("A7").map((t) => t.name)).toEqual(["A", "C#", "E", "G"]);
  expect(chordToneNames("nonsense")).toEqual([]);
});
