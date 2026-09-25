import { describe, expect, it } from "vitest";
import type { NoteEvent } from "../types";
import {
  baseLadder,
  gradeChanges,
  gradeChordStrings,
  gradeFretFind,
  gradeLine,
  gradeStrumIdentify,
  ladderAfterRun,
  ladderProjection,
  mergeLadders,
  sameChordSymbol,
  verifyChordTones,
} from "./technique";

const on = (midi: number, at: number, extra: Partial<NoteEvent> = {}): NoteEvent => ({
  kind: "noteon",
  midi,
  velocity: 0.8,
  at,
  source: "midi",
  confidence: 1,
  velocityMeasured: true,
  ...extra,
});

const C_MAJOR = [60, 62, 64, 65, 67, 69, 71, 72];
const line = (midis: number[]) => midis.map((midi) => [{ midi }]);

describe("gradeLine (scales, spider, positions)", () => {
  it("a clean even run scores 1", () => {
    const r = gradeLine({
      beats: line(C_MAJOR),
      beatMs: 500,
      notes: C_MAJOR.map((m, i) => on(m, 1000 + i * 500)),
    });
    expect(r).toMatchObject({
      score: 1,
      correct: true,
      pitch: 1,
      evenness: 1,
      clean: 8,
      total: 8,
      meanTimingErrorMs: 0,
    });
  });

  it("pitch x 0.85 + evenness x 0.15, correct at 0.9", () => {
    const played = C_MAJOR.map((m, i) => on(i === 1 ? 61 : m, i * 500));
    const r = gradeLine({ beats: line(C_MAJOR), beatMs: 500, notes: played });
    expect(r.pitch).toBe(7 / 8);
    expect(r.score).toBeCloseTo((7 / 8) * 0.85 + 0.15, 10);
    expect(r.correct).toBe(false);
    expect(r.metrics[1]).toEqual({ kind: "pitch", expectedMidi: 62, actualMidi: 61 });
  });

  it("a missed note does not shift later notes", () => {
    const played = C_MAJOR.flatMap((m, i) => (i === 2 ? [] : [on(m, i * 500)]));
    const r = gradeLine({ beats: line(C_MAJOR), beatMs: 500, notes: played });
    expect(r).toMatchObject({ clean: 7, evenness: 1, meanTimingErrorMs: 0 });
  });

  it("evenness is mean spacing error over 180 ms", () => {
    const four = [60, 62, 64, 65];
    const r = gradeLine({
      beats: line(four),
      beatMs: 500,
      notes: [0, 518, 1000, 1500].map((at, i) => on(four[i], at)),
    });
    expect(r.evennessErrorMs).toBe(12);
    expect(r.evenness).toBeCloseTo(1 - 12 / 180, 10);
  });

  it("a checkpoint can demand evenness outright", () => {
    const notes = C_MAJOR.map((m, i) => on(m, i * 500 + (i % 2) * 36));
    const beats = line(C_MAJOR);
    const r = gradeLine({ beats, beatMs: 500, notes });
    expect(r.evenness).toBeCloseTo(0.8, 10);
    expect(r.correct).toBe(true);
    expect(gradeLine({ beats, beatMs: 500, notes, minEvenness: 0.85 }).correct).toBe(false);
  });

  const both = C_MAJOR.map((m) => [
    { midi: m - 12, hand: "left" as const },
    { midi: m, hand: "right" as const },
  ]);

  it("hands together counts beats within 40 ms; a MIDI run that missed a hand scores that beat 0", () => {
    const notes = C_MAJOR.flatMap((m, i) => [
      on(m - 12, i * 500 + 10),
      ...(i === 3 ? [] : [on(m, i * 500)]),
    ]);
    const r = gradeLine({ beats: both, beatMs: 500, notes, handsTogether: true });
    expect(r.together).toEqual({ count: 7, beats: 8 });
    expect(r.notMeasured).toEqual([]);
  });

  it("on-screen hands together is not measured, not zero", () => {
    const notes = C_MAJOR.flatMap((m, i) => [
      on(m - 12, i * 500, { source: "onscreen" }),
      on(m, i * 500 + 100, { source: "onscreen" }),
    ]);
    const r = gradeLine({ beats: both, beatMs: 500, notes, handsTogether: true });
    expect(r.together).toBeNull();
    expect(r.notMeasured).toEqual(["together"]);
    expect(r.pitch).toBe(1);
  });

  it("an empty run scores 0", () => {
    expect(gradeLine({ beats: line(C_MAJOR), beatMs: 150, notes: [] })).toMatchObject({
      score: 0,
      correct: false,
    });
  });
});

describe("gradeFretFind", () => {
  const acceptable = [
    { midi: 64, string: 1, fret: 0 },
    { midi: 64, string: 2, fret: 5 },
  ];
  it("verifies position only for on-screen taps", () => {
    expect(gradeFretFind(acceptable, on(64, 0))).toMatchObject({
      correct: true,
      positionVerified: null,
      notMeasured: ["position"],
    });
    expect(
      gradeFretFind(acceptable, on(64, 0, { source: "onscreen", string: 2, fret: 5 })),
    ).toMatchObject({
      correct: true,
      positionVerified: true,
      notMeasured: [],
    });
    expect(
      gradeFretFind(acceptable, on(64, 0, { source: "onscreen", string: 3, fret: 9 })).correct,
    ).toBe(false);
    expect(gradeFretFind(acceptable, on(65, 0)).correct).toBe(false);
    expect(gradeFretFind(acceptable, null).score).toBe(0);
  });
});

describe("Chord-Perfect", () => {
  const cShape = [48, 52, 55, 60, 64];
  it("Build grades every voiced string, correct only if all", () => {
    expect(gradeChordStrings(cShape, [48, 52, 55, 60, 64])).toMatchObject({
      score: 1,
      correct: true,
    });
    const r = gradeChordStrings(cShape, [64, 48, 55, 60, 53]);
    expect(r).toMatchObject({ score: 0.8, correct: false, extra: [53] });
    expect(r.strings.map((s) => s.matched)).toEqual([true, false, true, true, true]);
  });

  it("chord-tone verification: coverage minus 0.25 x extra/expected", () => {
    const v = verifyChordTones([0, 4, 7], [0, 4, 7, 10]);
    expect(v).toMatchObject({ coverage: 1, correct: false, extra: [10], missing: [] });
    expect(v.score).toBeCloseTo(1 - 0.25 / 3, 10);
    expect(verifyChordTones([0, 4, 7], [0, 4]).score).toBeCloseTo(2 / 3, 10);
    expect(verifyChordTones([0, 4, 7], [7, 0, 4]).correct).toBe(true);
  });

  it("Strum & identify: confidence x 0.35 + verification x 0.65", () => {
    const base = { expectedSymbol: "C", expectedPcs: [0, 4, 7], observedPcs: [0, 4, 7] };
    const right = gradeStrumIdentify({
      ...base,
      candidates: [
        { symbol: "C", confidence: 0.9 },
        { symbol: "Am", confidence: 0.5 },
      ],
    });
    expect(right.score).toBeCloseTo(0.9 * 0.35 + 0.65, 10);
    expect(right.correct).toBe(true);
    const wrongTop = gradeStrumIdentify({
      ...base,
      candidates: [
        { symbol: "Am", confidence: 0.7 },
        { symbol: "C", confidence: 0.6 },
      ],
    });
    expect(wrongTop).toMatchObject({ correct: false, confidence: 0.6, identified: "Am" });
    const extra = gradeStrumIdentify({
      ...base,
      observedPcs: [0, 4, 7, 2],
      candidates: [{ symbol: "C", confidence: 1 }],
    });
    expect(extra.correct).toBe(false);
    expect(sameChordSymbol("C#m", "Dbm")).toBe(true);
    expect(sameChordSymbol("C", "Cm")).toBe(false);
  });

  const C = { id: "guitar.c-major", pcs: [0, 4, 7] };
  const G = { id: "guitar.g-major", pcs: [7, 11, 2] };
  const strum = (midis: number[], at: number) =>
    midis.map((m, i) => ({ midi: m, at: at + i * 15 }));

  it("Changes (untimed) alternates the pair over clusters", () => {
    const notes = [
      ...strum([48, 52, 55], 0),
      ...strum([43, 47, 50], 1000),
      ...strum([48, 52, 55], 2000),
      ...strum([43, 47], 3000),
    ];
    const r = gradeChanges({
      from: C,
      to: G,
      tuningId: "guitar.standard",
      notes,
      durationMs: 60000,
    });
    expect(r).toMatchObject({
      completed: 3,
      clean: 2,
      changesPerMinute: 3,
      onTime: null,
      correct: false,
    });
    expect(r.score).toBeCloseTo((1 + 1 + 1 + 2 / 3) / 4, 10);
    expect(r.metrics[0]).toMatchObject({
      kind: "chord-changes",
      completedChanges: 3,
      cleanChanges: 2,
      fromShapeId: "guitar.c-major",
    });
  });

  it("Changes (timed) grades against the bar and counts on-time changes", () => {
    const notes = [
      ...strum([48, 52, 55], 0),
      ...strum([43, 47, 50], 2050),
      ...strum([48, 52, 55], 4400),
    ];
    const r = gradeChanges({
      from: C,
      to: G,
      tuningId: "guitar.standard",
      notes,
      durationMs: 6000,
      clock: { bpm: 60, beatsPerChord: 2, anchorAt: 0 },
    });
    expect(r).toMatchObject({ completed: 2, clean: 2, onTime: 1, correct: false });
    expect(r.changesPerMinute).toBe(20);
  });
});

describe("tempo ladder", () => {
  it("promotes after two consecutive clean runs at or above the rung", () => {
    let s = ladderAfterRun(undefined, { bpm: 100, correct: true });
    expect(s).toEqual({ unlockedBpm: 100, streak: 1 });
    s = ladderAfterRun(s, { bpm: 105, correct: true });
    expect(s).toEqual({ unlockedBpm: 110, streak: 0 });
  });

  it("a failed run or a run below the rung resets the streak; the rung never drops", () => {
    const one = ladderAfterRun(baseLadder(), { bpm: 100, correct: true });
    expect(ladderAfterRun(one, { bpm: 100, correct: false })).toEqual({
      unlockedBpm: 100,
      streak: 0,
    });
    expect(ladderAfterRun(one, { bpm: 90, correct: true })).toEqual({
      unlockedBpm: 100,
      streak: 0,
    });
    expect(
      ladderAfterRun({ unlockedBpm: 150, streak: 1 }, { bpm: 60, correct: false }).unlockedBpm,
    ).toBe(150);
  });

  it("stops at the 180 ceiling", () => {
    expect(
      ladderAfterRun({ unlockedBpm: 180, streak: 1 }, { bpm: 180, correct: true }).unlockedBpm,
    ).toBe(180);
  });

  it("projects six rungs with unlocked / next / locked and practice suggestions", () => {
    const p = ladderProjection(undefined, 100);
    expect(p.rungs).toEqual([
      { bpm: 100, status: "unlocked" },
      { bpm: 110, status: "next" },
      { bpm: 120, status: "locked" },
      { bpm: 130, status: "locked" },
      { bpm: 140, status: "locked" },
      { bpm: 150, status: "locked" },
    ]);
    expect(p).toMatchObject({ nextBpm: 110, slowerBpm: 90 });
    expect(ladderProjection({ unlockedBpm: 170, streak: 0 }, 180).rungs.map((r) => r.bpm)).toEqual([
      130, 140, 150, 160, 170, 180,
    ]);
    expect(ladderProjection({ unlockedBpm: 170, streak: 0 }, 180)).toMatchObject({
      nextBpm: 180,
      slowerBpm: 170,
    });
    expect(ladderProjection(undefined, 60).slowerBpm).toBe(60);
  });

  it("merging two stored ladders keeps the max per variant", () => {
    expect(
      mergeLadders(
        { a: { unlockedBpm: 120, streak: 0 }, b: { unlockedBpm: 100, streak: 1 } },
        {
          a: { unlockedBpm: 110, streak: 1 },
          b: { unlockedBpm: 100, streak: 0 },
          c: { unlockedBpm: 130, streak: 0 },
        },
      ),
    ).toEqual({
      a: { unlockedBpm: 120, streak: 0 },
      b: { unlockedBpm: 100, streak: 1 },
      c: { unlockedBpm: 130, streak: 0 },
    });
  });
});
