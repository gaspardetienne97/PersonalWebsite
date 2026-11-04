import { describe, expect, it } from "vitest";
import { laneOutcomes } from "./lane-outcomes";

const beats = [
  { midi: 60, beat: 0, dur: 1 },
  { midi: 62, beat: 1, dur: 1 },
  { midi: 64, beat: 2, dur: 1 },
];

describe("laneOutcomes", () => {
  it("marks on time, early, late and missed notes, each hit used once", () => {
    const hits = [
      { midi: 60, beat: 0.05 },
      { midi: 62, beat: 0.65 },
      { midi: 60, beat: 0.1 },
    ];
    expect(laneOutcomes(beats, hits, null)).toEqual(["ok", "early", "miss"]);
    expect(laneOutcomes(beats, [{ midi: 64, beat: 2.4 }], null)).toEqual(["miss", "miss", "late"]);
  });

  it("leaves a note open until its window has passed", () => {
    expect(laneOutcomes(beats, [{ midi: 60, beat: 0 }], 1.2)).toEqual(["ok", undefined, undefined]);
    expect(laneOutcomes(beats, [], 1.6)).toEqual(["miss", "miss", undefined]);
  });

  it("never credits the wrong key", () => {
    expect(laneOutcomes(beats.slice(0, 1), [{ midi: 61, beat: 0 }], null)).toEqual(["miss"]);
  });
});
