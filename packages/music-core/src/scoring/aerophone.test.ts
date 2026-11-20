import { describe, expect, it } from "vite-plus/test";
import type { ControlEvent, NoteEvent } from "../types";
import {
  attackTiming,
  gradeArticulation,
  gradeIntervalLanding,
  gradeLongTone,
  gradeSwell,
  pushTrace,
  steadiness,
  swellEnvelope,
} from "./aerophone";

const note = (
  kind: "noteon" | "noteoff",
  midi: number,
  at: number,
  source: NoteEvent["source"] = "midi",
): NoteEvent => ({
  kind,
  midi,
  velocity: 0.8,
  at,
  source,
  confidence: 1,
  velocityMeasured: source === "midi",
});
const cc2 = (at: number, value: number): ControlEvent => ({ kind: "cc", controller: 2, value, at });
const breath = (durationMs: number, f: (t: number, i: number) => number) =>
  Array.from({ length: durationMs / 50 + 1 }, (_, i) => cc2(i * 50, f(i * 50, i)));

describe("steadiness", () => {
  it("is clamp01(1 - 4 x stdev) with at least two samples", () => {
    expect(steadiness([0.5, 0.5])).toBe(1);
    expect(steadiness([0.55, 0.65, 0.55, 0.65])).toBeCloseTo(0.8, 10);
    expect(steadiness([0.5])).toBe(0);
  });
  it("traces keep the last 64 samples", () => {
    let t: number[] = [];
    for (let i = 0; i < 70; i++) t = pushTrace(t, i);
    expect(t.length).toBe(64);
    expect(t[0]).toBe(6);
  });
});

const hold = (midi: number, from: number, to: number) => [
  note("noteon", midi, from),
  note("noteoff", midi, to),
];
const w = { targetMidi: 67, startAt: 0, durationMs: 5000, endAt: 6000 };

describe("long tone", () => {
  it("steadiness x 0.7 + pitch 0.2 + progress x 0.1", () => {
    const steady = gradeLongTone({
      ...w,
      notes: hold(67, 0, 5000),
      breath: breath(5000, () => 0.6),
    });
    expect(steady).toMatchObject({
      score: 1,
      correct: true,
      steadiness: 1,
      progress: 1,
      pitchCorrect: true,
    });
    const wobble = gradeLongTone({
      ...w,
      notes: hold(67, 0, 5000),
      breath: breath(5000, (_, i) => (i % 2 ? 0.65 : 0.55)),
    });
    expect(wobble.steadiness).toBeCloseTo(0.8, 2);
    const short = gradeLongTone({
      ...w,
      notes: hold(67, 0, 2500),
      breath: breath(5000, () => 0.6),
    });
    expect(short).toMatchObject({ progress: 0.5, correct: false });
    expect(short.score).toBeCloseTo(0.7 + 0.2 + 0.05, 10);
  });
  it("the wrong pitch earns no pitch or progress credit", () => {
    const r = gradeLongTone({ ...w, notes: hold(69, 0, 5000), breath: breath(5000, () => 0.6) });
    expect(r).toMatchObject({ pitchCorrect: false, progress: 0, correct: false });
    expect(r.score).toBeCloseTo(0.7, 10);
  });
  it("no breath (on-screen chart) is not measured and re-weighted", () => {
    const r = gradeLongTone({ ...w, notes: hold(67, 0, 5000), breath: [] });
    expect(r).toMatchObject({ steadiness: null, notMeasured: ["breath"], score: 1 });
  });
  it("an empty run scores 0", () => {
    expect(gradeLongTone({ ...w, notes: [], breath: [] }).score).toBe(0);
  });
});

describe("interval landing", () => {
  it("pitch 0.45 + steadiness x 0.45 + progress 0.1, correct at steadiness 0.75", () => {
    const iw = { ...w, durationMs: 3000 };
    expect(
      gradeIntervalLanding({ ...iw, notes: hold(67, 0, 3000), breath: breath(3000, () => 0.5) }),
    ).toMatchObject({ score: 1, correct: true });
    const shaky = gradeIntervalLanding({
      ...iw,
      notes: hold(67, 0, 3000),
      breath: breath(3000, (_, i) => (i % 2 ? 0.575 : 0.425)),
    });
    expect(shaky.steadiness).toBeCloseTo(0.7, 2);
    expect(shaky.correct).toBe(false);
  });
});

describe("swell", () => {
  const sw = { ...w, durationMs: 6000, endAt: 6000, notes: hold(67, 0, 6000) };
  it("a breath curve on the envelope is shaped and smooth", () => {
    const r = gradeSwell({ ...sw, breath: breath(6000, (t) => swellEnvelope(t / 6000)) });
    expect(r.shape).toBe(1);
    expect(r.smoothness!).toBeGreaterThan(0.99);
    expect(r.correct).toBe(true);
    expect(swellEnvelope(0)).toBeCloseTo(0.2, 10);
    expect(swellEnvelope(0.5)).toBeCloseTo(0.9, 10);
  });
  it("a flat breath misses the shape; a jittery one misses smoothness", () => {
    const flat = gradeSwell({ ...sw, breath: breath(6000, () => 0.55) });
    expect(flat.shape!).toBeLessThan(0.8);
    expect(flat.correct).toBe(false);
    const jitter = gradeSwell({
      ...sw,
      breath: breath(6000, (t, i) => swellEnvelope(t / 6000) + (i % 2 ? 0.05 : -0.05)),
    });
    expect(jitter.smoothness!).toBeLessThan(0.01);
    expect(jitter.correct).toBe(false);
  });
});

describe("articulation", () => {
  const beatMs = 60000 / 90;
  const repeated = (fraction: number, source: NoteEvent["source"] = "midi") =>
    Array.from({ length: 8 }, (_, i) => [
      note("noteon", 67, i * beatMs, source),
      note("noteoff", 67, i * beatMs + fraction * beatMs, source),
    ]).flat();
  const base = { targetMidi: 67, count: 8, beatMs };
  it("pitch x 0.5 + articulation x 0.5 against the sounding-fraction target", () => {
    expect(gradeArticulation({ ...base, style: "staccato", notes: repeated(0.35) })).toMatchObject({
      score: 1,
      correct: true,
    });
    const r = gradeArticulation({ ...base, style: "staccato", notes: repeated(0.95) });
    expect(r.articulation).toBeCloseTo(0, 10);
    expect(r.score).toBeCloseTo(0.5, 10);
    expect(gradeArticulation({ ...base, style: "legato", notes: repeated(0.95) }).correct).toBe(
      true,
    );
    expect(
      gradeArticulation({ ...base, style: "legato", notes: repeated(0.65) }).articulation,
    ).toBeCloseTo(0.5, 10);
  });
  it("without note-offs or on-screen, articulation is not measured", () => {
    const r = gradeArticulation({ ...base, style: "staccato", notes: repeated(0.95, "onscreen") });
    expect(r).toMatchObject({ articulation: null, notMeasured: ["articulation"], score: 1 });
    const noOffs = repeated(0.35).filter((n) => n.kind === "noteon");
    expect(
      gradeArticulation({ ...base, style: "staccato", notes: noOffs }).articulation,
    ).toBeNull();
  });
  it("every pitch must be right", () => {
    const notes = repeated(0.35).map((n, i) => (i === 4 ? { ...n, midi: 69 } : n));
    expect(gradeArticulation({ ...base, style: "staccato", notes })).toMatchObject({
      pitch: 7 / 8,
      correct: false,
    });
    expect(gradeArticulation({ ...base, style: "staccato", notes: [] }).score).toBe(0);
  });
});

describe("attack timing", () => {
  const beatMs = 500;
  it("times each attack against its click, early negative, late positive", () => {
    const notes = [0, 510, 960, 1700].flatMap((at) => [
      note("noteon", 67, 1000 + at),
      note("noteoff", 67, 1000 + at + 150),
    ]);
    const t = attackTiming({ count: 4, stepMs: beatMs, downbeat: 1000, notes });
    expect(t.offsets).toEqual([0, 10, -40, 200]);
    // Within a quarter of the step (125 ms here) and never past 100 ms.
    expect(t.windowMs).toBe(100);
    expect(t).toMatchObject({ onTime: 3, timing: 0.75 });
    expect(t.meanOffsetMs).toBeCloseTo(42.5, 6);
    expect(attackTiming({ count: 4, stepMs: beatMs, downbeat: 1000, notes: [] }).offsets).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
  it("a tongue stop the instrument kept sounding is timed from the breath", () => {
    // One note-on, then three dips and rises in CC 2 on the next clicks.
    const notes = [note("noteon", 67, 1000)];
    const breath = [
      cc2(1005, 0.8),
      ...[1, 2, 3].flatMap((i) => [
        cc2(1000 + i * beatMs - 40, 0.1),
        cc2(1000 + i * beatMs + 15, 0.8),
      ]),
    ];
    const t = attackTiming({ count: 4, stepMs: beatMs, downbeat: 1000, notes, breath });
    expect(t.offsets).toEqual([0, 15, 15, 15]);
    // A breath rise just after a note-on is the same attack.
    const both = attackTiming({
      count: 1,
      stepMs: beatMs,
      downbeat: 1000,
      notes,
      breath: [cc2(990, 0.1), cc2(1020, 0.8)],
    });
    expect(both.offsets).toEqual([0]);
  });
  it("with a downbeat, articulation needs three in four attacks on the click", () => {
    const at = (i: number) => 1000 + i * beatMs + (i % 2 ? 150 : 0);
    const notes = Array.from({ length: 8 }, (_, i) => [
      note("noteon", 67, at(i)),
      note("noteoff", 67, at(i) + 0.35 * beatMs),
    ]).flat();
    const r = gradeArticulation({
      targetMidi: 67,
      count: 8,
      style: "staccato",
      beatMs,
      notes,
      downbeat: 1000,
    });
    expect(r.timing).toMatchObject({ onTime: 4, timing: 0.5 });
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(0.4 + 0.3 + 0.3 * 0.5, 6);
    const steady = Array.from({ length: 8 }, (_, i) => [
      note("noteon", 67, 1000 + i * beatMs),
      note("noteoff", 67, 1000 + i * beatMs + 0.35 * beatMs),
    ]).flat();
    expect(
      gradeArticulation({
        targetMidi: 67,
        count: 8,
        style: "staccato",
        beatMs,
        notes: steady,
        downbeat: 1000,
      }),
    ).toMatchObject({ score: 1, correct: true });
  });
});
