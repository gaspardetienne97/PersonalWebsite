import { describe, expect, it } from "vitest";
import grooves from "../data/mpc-grooves.json";
import type { NoteEvent } from "../types";
import {
  gradeGroove,
  gradeRudiment,
  grooveCaptureEnd,
  grooveVoiceError,
  inAccentBand,
  type Accent,
  type GrooveResult,
  tempoDrift,
} from "./pads";

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
const onscreen = { source: "onscreen" as const, velocityMeasured: undefined };

describe("gradeRudiment", () => {
  // single strokes, eighths at 60 BPM: 8 strokes 500 ms apart, pads 36 / 38
  const strokes = Array.from({ length: 8 }, (_, i) => ({
    pad: i % 2 ? 38 : 36,
    offsetMs: i * 500,
  }));
  const play = (f: (i: number) => Partial<NoteEvent> & { dt?: number } = () => ({})) =>
    strokes.map((s, i) => {
      const { dt = 0, ...rest } = f(i);
      return on(s.pad, 1000 + s.offsetMs + dt, rest);
    });

  it("a clean run scores 1", () => {
    expect(gradeRudiment({ strokes, stepMs: 500, anchorAt: 1000, hits: play() })).toMatchObject({
      score: 1,
      correct: true,
      pad: 1,
      timing: 1,
      velocity: 1,
      completion: 1,
    });
  });

  it("pad x 0.45 + timing x 0.3 + velocity x 0.15 + completion x 0.1", () => {
    const wrongPad = play((i) => (i === 3 ? { midi: 36 } : {}));
    const r = gradeRudiment({ strokes, stepMs: 500, anchorAt: 1000, hits: wrongPad });
    expect(r).toMatchObject({ pad: 0.875, completion: 1, correct: true });
    expect(r.perStroke[3]).toEqual({ errorMs: 0, rightPad: false });
    expect(r.perStroke[2]).toEqual({ errorMs: 0, rightPad: true });
    expect(r.score).toBeCloseTo(0.45 * 0.875 + 0.3 + 0.15 + 0.1, 10);
  });

  it("timing = 1 - meanAbsErr/180 against the count-in, else the first hit", () => {
    const late = play(() => ({ dt: 45 }));
    expect(gradeRudiment({ strokes, stepMs: 500, anchorAt: 1000, hits: late }).timing).toBeCloseTo(
      0.75,
      10,
    );
    expect(gradeRudiment({ strokes, stepMs: 500, hits: late }).timing).toBe(1);
    expect(
      gradeRudiment({ strokes, stepMs: 500, anchorAt: 1000, hits: play(() => ({ dt: 100 })) })
        .correct,
    ).toBe(false);
  });

  it("on-screen velocity is not measured and the score is velocity-free", () => {
    const r = gradeRudiment({ strokes, stepMs: 500, anchorAt: 1000, hits: play(() => onscreen) });
    expect(r).toMatchObject({ velocity: null, notMeasured: ["velocity"], score: 1, correct: true });
  });

  it("bands raise the velocity bar to 0.875", () => {
    const banded = strokes.map((s, i) => ({
      ...s,
      band: i % 2 ? ("tap" as const) : ("accent" as const),
    }));
    const hits = play((i) => ({ velocity: i % 2 ? 0.5 : i === 0 ? 0.6 : 0.9 }));
    const r = gradeRudiment({ strokes: banded, stepMs: 500, anchorAt: 1000, hits });
    expect(r.velocity).toBe(7 / 8);
    expect(r.correct).toBe(true);
    const two = play((i) => ({ velocity: i % 2 ? 0.5 : i < 4 ? 0.6 : 0.9 }));
    expect(gradeRudiment({ strokes: banded, stepMs: 500, anchorAt: 1000, hits: two }).correct).toBe(
      false,
    );
  });

  it("bands are not graded when every MIDI hit has the same velocity (Full Level)", () => {
    const banded = strokes.map((s, i) => ({
      ...s,
      band: i % 2 ? ("tap" as const) : ("accent" as const),
    }));
    const r = gradeRudiment({ strokes: banded, stepMs: 500, anchorAt: 1000, hits: play() });
    expect(r).toMatchObject({ velocity: null, notMeasured: ["velocity"], score: 1, correct: true });
  });

  it("an incomplete or empty run is not correct", () => {
    expect(
      gradeRudiment({ strokes, stepMs: 500, anchorAt: 1000, hits: play().slice(0, 7) }),
    ).toMatchObject({ completion: 7 / 8, correct: false });
    expect(gradeRudiment({ strokes, stepMs: 500, anchorAt: 1000, hits: [] })).toMatchObject({
      score: 0,
      correct: false,
    });
  });
});

const PADS = Object.fromEntries(grooves.voices.map((v) => [v.id, v.midi]));
const groove = (id: string) => {
  const g = grooves.catalog.find((c) => c.value === id)!;
  return {
    targets: g.targets as { voice: string; beat: number; accent: Accent }[],
    sectionLabels: g.sectionLabels,
  };
};
const beatMs = 500;
const play = (
  targets: { voice: string; beat: number; accent: Accent }[],
  vel = (a: Accent) => (a === "accent" ? 110 : 70) / 127,
  extra: Partial<NoteEvent> = {},
) => targets.map((t) => on(PADS[t.voice], t.beat * beatMs, { velocity: vel(t.accent), ...extra }));
const base = { voicePads: PADS, beatsPerBar: 4, beatMs, startAt: 0 };

describe("gradeGroove", () => {
  it("window is min(180, beat/8) and capture stays open past the last beat", () => {
    const g = groove("backbeat");
    const r = gradeGroove({ ...base, ...g, hits: play(g.targets) }) as GrooveResult;
    expect(r).toMatchObject({
      windowMs: 62.5,
      captureEnd: 1562.5,
      score: 1,
      correct: true,
      accuracy: 1,
    });
    expect(grooveCaptureEnd(1500, 500, 1200)).toBe(1562.5);
    expect(grooveCaptureEnd(1500, 500, 2000)).toBe(2000);
    const lateLast = play(g.targets).map((h, i) => (i === 3 ? { ...h, at: h.at + 60 } : h));
    const late = gradeGroove({ ...base, ...g, hits: lateLast }) as GrooveResult;
    expect(late.matched).toBe(4);
    expect(late.perTarget).toEqual([0, 0, 0, 60]);
    const missing = gradeGroove({ ...base, ...g, hits: play(g.targets).slice(1) }) as GrooveResult;
    expect(missing.perTarget[0]).toBeNull();
  });

  it("accuracy = matched / (targets + extras); extras and misses are separate", () => {
    const g = groove("backbeat");
    const r = gradeGroove({
      ...base,
      ...g,
      hits: [...play(g.targets), on(38, 750)],
    }) as GrooveResult;
    expect(r).toMatchObject({ accuracy: 0.8, extra: 1, missed: 0, correct: false });
    const miss = gradeGroove({ ...base, ...g, hits: play(g.targets).slice(1) }) as GrooveResult;
    expect(miss).toMatchObject({ accuracy: 0.75, missed: 1, extra: 0 });
  });

  it("matching is per voice: a snare hit cannot answer a kick", () => {
    const g = groove("backbeat");
    const hits = play(g.targets).map((h, i) => (i === 0 ? { ...h, midi: 38 } : h));
    expect(gradeGroove({ ...base, ...g, hits })).toMatchObject({ matched: 3, missed: 1, extra: 1 });
  });

  it("with assessable accents: accuracy x 0.85 + inBand/targets x 0.15", () => {
    const g = groove("boom-bap-2bar");
    const accents = g.targets.filter((t) => t.accent === "accent").length;
    // a normal-marked hit at 100 is as wrong as one at 20
    for (const normal of [100, 20]) {
      const r = gradeGroove({
        ...base,
        ...g,
        hits: play(g.targets, (a) => (a === "accent" ? 120 : normal) / 127),
      }) as GrooveResult;
      expect(r.inBand).toBe(accents);
      expect(r.score).toBeCloseTo(0.85 + (accents / g.targets.length) * 0.15, 10);
    }
    expect((gradeGroove({ ...base, ...g, hits: play(g.targets) }) as GrooveResult).inBand).toBe(
      g.targets.length,
    );
    expect(inAccentBand("normal", 89 / 127)).toBe(true);
    expect(inAccentBand("normal", 90 / 127)).toBe(false);
    expect(inAccentBand("accent", 90 / 127)).toBe(true);
  });

  it("fixed or on-screen velocity is not assessable", () => {
    const g = groove("backbeat");
    const flat = gradeGroove({ ...base, ...g, hits: play(g.targets, () => 0.8) }) as GrooveResult;
    expect(flat).toMatchObject({ inBand: null, notMeasured: ["velocity"], score: 1 });
    const screen = gradeGroove({
      ...base,
      ...g,
      hits: play(g.targets, undefined, onscreen),
    }) as GrooveResult;
    expect(screen.inBand).toBeNull();
  });

  it("breaks down per voice and per section (the fill is scored separately)", () => {
    const g = groove("turnaround-fill");
    const hits = play(g.targets.filter((t) => t.beat < 12));
    const r = gradeGroove({ ...base, ...g, hits }) as GrooveResult;
    const fill = r.perSection.find((s) => s.label === "fill")!;
    const grooveSec = r.perSection.find((s) => s.label === "groove")!;
    expect(fill).toMatchObject({ matched: 0, missed: 15 });
    expect(grooveSec).toMatchObject({ missed: 0, extra: 0 });
    expect(r.perVoice.find((v) => v.voice === "perc")).toMatchObject({ matched: 0, pad: 39 });
  });

  it("reports the ghost-to-accent velocity ratio for the ghost-note path check", () => {
    const g = groove("boom-bap-2bar");
    const r = gradeGroove({
      ...base,
      ...g,
      hits: play(g.targets, (a) => (a === "accent" ? 1 : 0.3)),
    }) as GrooveResult;
    expect(r.ghostRatio).toBeCloseTo(0.3, 10);
  });

  it("every voice must map to a distinct pad", () => {
    expect(grooveVoiceError(["kick", "snare"], { kick: 36, snare: 36 })).toBe(
      "kick and snare share pad 36.",
    );
    expect(grooveVoiceError(["kick"], {})).toBe("No pad is mapped to kick.");
    expect(grooveVoiceError(["kick"], { kick: 200 })).toMatch(/outside/);
    const g = groove("backbeat");
    expect(gradeGroove({ ...base, ...g, voicePads: { kick: 36, snare: 36 }, hits: [] })).toEqual({
      error: "kick and snare share pad 36.",
    });
  });

  it("an empty run scores 0", () => {
    const g = groove("backbeat");
    expect(gradeGroove({ ...base, ...g, hits: [] })).toMatchObject({ score: 0, correct: false });
  });
});

describe("tempo drift", () => {
  const beatMs = 500; // 120 BPM
  const targets = Array.from({ length: 16 }, (_, i) => ({ beat: i, pad: 36 }));
  const played = (errAt: (beat: number) => number) =>
    targets.map((t) => on(36, 1000 + t.beat * beatMs + errAt(t.beat)));

  it("reads the tempo played after the click stops", () => {
    expect(
      tempoDrift(
        targets,
        played(() => 0),
        beatMs,
        1000,
        4,
      ),
    ).toMatchObject({
      driftBpm: 0,
      endOffsetMs: 0,
    });
    // Each beat 5 ms early from the click's end: rushing to about 121.2 BPM.
    const r = tempoDrift(
      targets,
      played((b) => (b < 4 ? 0 : -(b - 3) * 5)),
      beatMs,
      1000,
      4,
    )!;
    expect(r.bpmPlayed).toBeCloseTo(121.2, 1);
    expect(r.endOffsetMs).toBeLessThan(-50);
    expect(
      tempoDrift(targets.slice(0, 3), played(() => 0).slice(0, 3), beatMs, 1000, 0),
    ).toBeNull();
  });

  it("follows a steady rush past the match window, where the grid matches would stop", () => {
    // 12 bars of eighths, 20 ms early per beat on your own: 800 ms ahead by the end, far past the 62 ms window.
    const eighths = Array.from({ length: 96 }, (_, i) => ({ beat: i / 2, pad: 42 }));
    const hits = eighths.map((t) => on(42, 1000 + t.beat * beatMs - Math.max(0, t.beat - 4) * 20));
    const r = tempoDrift(eighths, hits, beatMs, 1000, 4)!;
    expect(r).not.toBeNull();
    expect(r.bpmPlayed).toBeCloseTo(125, 0);
    expect(r.endOffsetMs).toBeLessThan(-700);
  });
});
