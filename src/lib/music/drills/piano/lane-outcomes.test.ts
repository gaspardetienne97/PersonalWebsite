import { describe, expect, it } from "vitest";
import { laneOutcomes, lineOutcomes, timingFromErrors, timingOf, verdictOf } from "./lane-outcomes";

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

describe("lineOutcomes and timingOf", () => {
  const targets = [
    { midi: 60, beat: 0 },
    { midi: 62, beat: 1 },
    { midi: 64, beat: 2 },
    { midi: 65, beat: 3 },
  ];
  it("grades each played note by its place, any octave, and leaves unplayed ones open", () => {
    const out = lineOutcomes(
      targets,
      [
        { midi: 72, beat: 0.05 },
        { midi: 62, beat: 0.7 },
        { midi: 63, beat: 2 },
      ],
      0.25,
    );
    expect(out).toEqual(["ok", "early", "miss", undefined]);
  });
  it("counts a finished run, unplayed notes as missed", () => {
    expect(timingOf(["ok", "early", "late", "miss", undefined])).toEqual({
      onTime: 1,
      early: 1,
      late: 1,
      missed: 2,
    });
  });
  it("words a verdict with the error in ms only when off the beat", () => {
    expect(verdictOf("ok", 12)).toEqual({ kind: "ontime" });
    expect(verdictOf("late", 41.6)).toEqual({ kind: "late", text: "Late 42 ms" });
  });
});

describe("timingFromErrors", () => {
  it("splits errors by the on-time window, misses counted", () => {
    expect(timingFromErrors([0, -50, 70, null, 20], 30)).toEqual({
      onTime: 2,
      early: 1,
      late: 1,
      missed: 1,
    });
  });
});
