import { describe, expect, it } from "vite-plus/test";
import { fretFinger, scaleFretMarks } from "./fret-marks";

// G A B G up and back down, on frets 12 to 14 of the top strings.
const at = new Map([
  [67, { string: 1, fret: 12 }],
  [69, { string: 1, fret: 14 }],
  [71, { string: 2, fret: 12 }],
]);
const steps = [67, 69, 71, 69, 67].map((midi) => ({ notes: [{ midi }] }));
const mark = (ms: ReturnType<typeof scaleFretMarks>, string: number, fret: number) =>
  ms.find((m) => m.string === string && m.fret === fret)!;

describe("scaleFretMarks", () => {
  it("marks the root and each target's finger before a run", () => {
    const ms = scaleFretMarks({ steps, at, tonic: 55, all: true, outcomes: [] });
    expect(ms).toHaveLength(3);
    expect(mark(ms, 1, 12)).toMatchObject({
      role: "root",
      finger: 1,
      label: "1",
      spoken: "target, root",
    });
    expect(mark(ms, 1, 14)).toMatchObject({ role: undefined, finger: 3, label: "3" });
  });

  it("lights the step to play now and keeps a place's worse take", () => {
    const ms = scaleFretMarks({
      steps,
      at,
      tonic: 55,
      all: true,
      outcomes: ["correct", "correct", "wrong", "wrong"],
      now: 4,
    });
    expect(mark(ms, 1, 12)).toMatchObject({
      state: "now",
      label: "1",
      spoken: "target, root, play next",
    });
    expect(mark(ms, 1, 14)).toMatchObject({ state: "wrong", label: "✕" });
    expect(mark(ms, 2, 12)).toMatchObject({ state: "wrong" });
  });

  it("shows missed steps after a run, and only the demo's step when targets are hidden", () => {
    const after = scaleFretMarks({
      steps,
      at,
      tonic: 55,
      all: true,
      outcomes: ["correct", "missed", "missed", "missed", "missed"],
    });
    expect(mark(after, 1, 12)).toMatchObject({ state: "wrong", spoken: "target, root, missed" });
    const demo = scaleFretMarks({ steps, at, tonic: 55, all: false, outcomes: [], demo: 1 });
    expect(demo).toEqual([expect.objectContaining({ string: 1, fret: 14, demo: true })]);
  });

  it("gives one finger a fret and none to open strings", () => {
    expect([0, 5, 6, 7, 8, 9].map((f) => fretFinger(f, 5))).toEqual([undefined, 1, 2, 3, 4, 4]);
  });
});
