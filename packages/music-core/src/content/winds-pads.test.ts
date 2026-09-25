import { describe, expect, it } from "vitest";
import {
  AEROPHONE_CHART,
  articulationTargets,
  fingeringFor,
  GROOVE_PAD_RANGE,
  grooveTargets,
  LANDING_INTERVALS,
  landingTarget,
  rudimentHits,
} from "./winds-pads";

describe("aerophone", () => {
  it("charts Bb3..F#5 with the verified set flagged", () => {
    expect(AEROPHONE_CHART.map((c) => c.midi)).toEqual(
      Array.from({ length: 21 }, (_, i) => 58 + i),
    );
    expect(AEROPHONE_CHART.filter((c) => c.verified).map((c) => c.name)).toEqual([
      "C4",
      "D4",
      "E4",
      "F4",
      "G4",
      "A4",
      "B4",
      "C#5",
      "D5",
      "Eb5",
    ]);
    expect(fingeringFor(66)).toEqual({
      midi: 66,
      name: "F#4",
      keys: ["k1", "k2", "k3", "k5"],
      octave: false,
      verified: false,
    });
    expect(fingeringFor(74)?.octave).toBe(true);
    expect(fingeringFor(73)?.keys).toEqual([]);
    expect(fingeringFor(57)).toBeUndefined();
  });

  it("lands intervals inside the chart only", () => {
    expect(LANDING_INTERVALS.map((i) => i.semitones)).toEqual([5, 7, 12, 4, 3]);
    expect(landingTarget(67, 5, "up")).toBe(72);
    expect(landingTarget(67, 12, "down")).toBeUndefined();
    const t = articulationTargets({ midi: 67, bpm: 90, count: 8, style: "staccato" });
    expect(t).toHaveLength(8);
    expect(t[1].atMs).toBeCloseTo(666.667, 2);
    expect(t[0].soundingMs).toBeCloseTo(666.667 * 0.35, 2);
  });
});

describe("MPC rudiments", () => {
  it("alternates two pads on the chosen grid", () => {
    const hits = rudimentHits({ patternId: "single-strokes", subdivision: 2, hits: 16, bpm: 60 });
    expect(hits).toHaveLength(16);
    expect(hits.map((h) => h.atMs)).toEqual(Array.from({ length: 16 }, (_, i) => i * 500));
    expect(hits.slice(0, 4).map((h) => h.pad)).toEqual([36, 38, 36, 38]);
    const para = rudimentHits({
      patternId: "paradiddle",
      subdivision: 4,
      hits: 8,
      bpm: 60,
      pads: [40, 41],
    });
    expect(para.map((h) => h.hand[0]).join("")).toBe("lrllrlrr");
  });

  it("lets a pattern's own grid win and clamps tempo 30..240", () => {
    expect(
      rudimentHits({ patternId: "single-16ths", subdivision: 2, hits: 8, bpm: 60 })[1].atMs,
    ).toBe(250);
    expect(
      rudimentHits({ patternId: "triple-strokes", subdivision: 4, hits: 8, bpm: 60 })[1].atMs,
    ).toBeCloseTo(333.333, 2);
    expect(
      rudimentHits({ patternId: "single-strokes", subdivision: 2, hits: 8, bpm: 300 })[1].atMs,
    ).toBe(125);
    expect(
      rudimentHits({ patternId: "single-strokes", subdivision: 2, hits: 8, bpm: 10 })[1].atMs,
    ).toBe(1000);
    expect(() =>
      rudimentHits({
        patternId: "single-strokes",
        subdivision: 2,
        hits: 8,
        bpm: 60,
        pads: [36, 36],
      }),
    ).toThrow();
  });

  it("adds flam grace notes 30 ms early on the other pad", () => {
    const hits = rudimentHits({ patternId: "flam", subdivision: 2, hits: 8, bpm: 60 });
    expect(hits.filter((h) => !h.grace)).toHaveLength(8);
    expect(hits.slice(0, 2)).toEqual([
      { index: -1, atMs: -30, hand: "right", pad: 38, accent: false, grace: true },
      { index: 0, atMs: 0, hand: "left", pad: 36, accent: false, grace: false },
    ]);
  });

  it("moves the accent one position each beat with velocity bands", () => {
    const hits = rudimentHits({ patternId: "moving-accent", subdivision: 4, hits: 16, bpm: 60 });
    expect(hits.flatMap((h, i) => (h.accent ? [i] : []))).toEqual([0, 5, 10, 15]);
    expect(hits[0].velocityBand).toEqual([0.75, 1]);
    expect(hits[1].velocityBand).toEqual([0.25, 0.7]);
    expect(
      rudimentHits({ patternId: "single-strokes", subdivision: 2, hits: 8, bpm: 60 })[0]
        .velocityBand,
    ).toBeUndefined();
  });
});

describe("MPC grooves", () => {
  it("expands every catalog groove with the authored counts", () => {
    const count = (id: string) => grooveTargets(id, 90).targets.length;
    expect(
      ["backbeat", "eighth-hats", "syncopated", "boom-bap-2bar", "turnaround-fill"].map(count),
    ).toEqual([4, 12, 13, 25, 52]);
    expect(GROOVE_PAD_RANGE).toEqual([35, 51]);
  });

  it("carries voice, pad, accent and section per target", () => {
    const { targets, matchWindowMs, lengthMs } = grooveTargets("turnaround-fill", 90);
    expect(matchWindowMs).toBeCloseTo(666.667 / 8, 2);
    expect(lengthMs).toBeCloseTo(16 * 666.667, 1);
    const fill = targets.filter((t) => t.section === "fill");
    expect(fill).toHaveLength(15);
    expect(fill.at(-1)).toMatchObject({ beat: 16, voice: "kick", pad: 36, bar: 4 });
    expect(targets.find((t) => t.voice === "perc")).toMatchObject({
      pad: 39,
      accent: true,
      beat: 14,
    });
    expect(targets.filter((t) => t.bar === 1)).toHaveLength(13);
    expect(
      grooveTargets("boom-bap-2bar", 60).targets.find((t) => t.voice === "openhat"),
    ).toMatchObject({ pad: 46, atMs: 3500 });
    expect(grooveTargets("backbeat", 60).matchWindowMs).toBe(125);
    expect(grooveTargets("backbeat", 20).matchWindowMs).toBe(180);
  });
});
