import { describe, expect, it } from "vite-plus/test";
import {
  echoGroove,
  fillGroove,
  fillReport,
  gradeDynamics,
  gradeImprovise,
  improviseReport,
  inRange,
  ladderBand,
  orchestrationGroove,
  ostinatoGroove,
  ostinatoReport,
  quantise,
  rankCorrelation,
  velocityRange,
} from "./pad-skills";

describe("pad skills", () => {
  it("builds a fill that lands on the one, and calls a rushed fill rushed", () => {
    const g = fillGroove("down-the-toms");
    expect(g.bars).toBe(4);
    expect(g.landing.map((i) => g.targets[i].voice).sort()).toEqual(["crash", "kick"]);
    expect(g.targets[g.landing[0]].beat).toBe(16);
    // The fill's own notes: the sixteenths from beat 3 on, not the bar's kick on the one or its hats.
    expect(g.fill.every((i) => g.targets[i].beat >= 14)).toBe(true);
    expect(g.fill.map((i) => g.targets[i].voice).sort()).toEqual([
      "snare",
      "snare",
      "snare",
      "snare",
      "tom-low",
      "tom-low",
      "tom-mid",
      "tom-mid",
    ]);
    const per = g.targets.map((_, i) =>
      g.fill.includes(i) ? -30 : g.landing.includes(i) ? 10 : 0,
    );
    expect(fillReport(g, per)).toMatchObject({
      rushed: true,
      landed: true,
      fillMeanMs: -30,
      landingMs: 10,
    });
    // The groove notes of the fill bar rushing does not make the fill rushed.
    const barOnly = g.targets.map((t, i) =>
      t.beat >= 12 && t.beat < 16 && !g.fill.includes(i) ? -30 : 0,
    );
    expect(fillReport(g, barOnly).rushed).toBe(false);
    expect(
      fillReport(
        g,
        g.targets.map(() => 0),
      ).rushed,
    ).toBe(false);
  });

  it("spreads a paradiddle across the kit", () => {
    const g = orchestrationGroove("hats-snare");
    const first = g.targets.filter((t) => t.beat < 2 && t.voice !== "kick").map((t) => t.voice);
    expect(first).toEqual(["hats", "snare", "hats", "hats", "snare", "hats", "snare", "snare"]);
    // Kick under each group's accent.
    expect(
      g.targets
        .filter((t) => t.voice === "kick")
        .map((t) => t.beat)
        .slice(0, 2),
    ).toEqual([0, 1]);
    const toms = orchestrationGroove("toms-lead")
      .targets.filter((t) => t.beat === 0 || t.beat === 1)
      .map((t) => t.voice);
    expect(toms).toEqual(["tom-mid", "tom-low"]);
  });

  it("measures the ostinato against its own baseline", () => {
    const g = ostinatoGroove("offbeats");
    const per = g.targets.map((t) =>
      t.voice === "hats" && t.beat >= 8 && t.beat % 2 === 0 ? null : 0,
    );
    const r = ostinatoReport(g, per);
    expect(r.alone).toBe(1);
    expect(r.together).toBeCloseTo(0.75);
    expect(r.held).toBe(false);
  });

  it("puts the answers after the calls", () => {
    const g = echoGroove("kick-snare");
    expect(g.bars).toBe(8);
    expect(g.calls[0].beat).toBe(0);
    expect(g.targets[0].beat).toBe(4);
    expect(g.targets.every((t) => Math.floor(t.beat / 4) % 2 === 1)).toBe(true);
  });

  it("grades dynamics on the player's own range", () => {
    const r = velocityRange([0.2, 0.25], [0.9, 0.95])!;
    expect(inRange(0.575, r)).toBeCloseTo(0.5);
    expect(velocityRange([0.5], [0.55])).toBeNull();
    const ladder = Array.from({ length: 16 }, (_, i) => (ladderBand(i)[0] + ladderBand(i)[1]) / 2);
    expect(gradeDynamics("ladder", ladder)).toMatchObject({ correct: true, inBand: 1 });
    const rising = Array.from({ length: 16 }, (_, i) => i / 15);
    expect(rankCorrelation(rising)).toBe(1);
    expect(gradeDynamics("crescendo", rising).correct).toBe(true);
    expect(
      gradeDynamics(
        "crescendo",
        rising.map((v) => v * 0.3),
      ).correct,
    ).toBe(false);
    expect(gradeDynamics("even", Array(16).fill(0.5)).correct).toBe(true);
    expect(gradeDynamics("even", rising).correct).toBe(false);
  });

  it("describes an improvisation and nudges it half way to the grid", () => {
    const beat = 500;
    const hits = [0, 130, 250, 380, 500, 640].map((at, i) => ({
      at,
      midi: 36 + (i % 3),
      velocity: 0.3 + i * 0.1,
    }));
    const r = improviseReport(hits, 0, beat);
    expect(r.hits).toBe(6);
    expect(r.pads).toEqual([36, 37, 38]);
    expect(r.timingSpreadMs).toBeGreaterThan(0);
    expect(quantise([{ at: 130 }], 0, beat)[0].at).toBe(127.5);
  });
});

describe("triplet fills", () => {
  it("sit on a shuffle, the fill's own notes on the triplets, landing on the one", () => {
    const g = fillGroove("triplet-toms");
    expect(g.stepsPerBeat).toBe(3);
    expect(g.sectionLabels).toEqual(["groove", "groove", "groove", "fill"]);
    const own = g.fill.map((i) => `${g.targets[i].voice}@${g.targets[i].beat.toFixed(2)}`);
    expect(own).toEqual([
      "snare@14.00",
      "snare@14.33",
      "snare@14.67",
      "tom-high@15.00",
      "tom-mid@15.33",
      "tom-low@15.67",
    ]);
    expect(g.landing.map((i) => g.targets[i].beat)).toEqual([16, 16]);
  });
});

describe("gradeImprovise", () => {
  const beat = 500;
  const bar = beat * 4;
  /** Kick on 1 and snare on 3 in each bar, eight sixteenths of toms in each `fillEvery`th bar, landing on the next one. */
  const take = (bars: number, fillEvery = 0, stretch = 1, jitter = 0) =>
    Array.from({ length: bars }, (_, b) => {
      const fill = fillEvery && (b + 1) % fillEvery === 0;
      const steps = fill ? [0, 8, 9, 10, 11, 12, 13, 14, 15] : [0, 8, 12];
      return steps.map((s, i) => ({
        at: (b * bar + (s * beat) / 4) * stretch + (i % 2 ? jitter : -jitter),
        midi: fill && s > 8 ? 45 + (s % 3) : s === 8 ? 38 : 36,
      }));
    })
      .flat()
      .concat({ at: bars * bar * stretch, midi: 36 });

  it("passes steady playing in every bar with each fill landed", () => {
    const g = gradeImprovise(take(32, 4), 0, beat, 32, { fillEvery: 4 });
    expect(g.fills).toEqual({ expected: 8, landed: 8 });
    expect(g.density).toBe(1);
    expect(g.time).toBe(1);
    expect(g.correct).toBe(true);
    expect(g.score).toBe(1);
  });

  it("marks loose time down and catches a drifting tempo", () => {
    // 40 ms off on almost every hit: about 1 - 25 / 45.
    const loose = gradeImprovise(take(16, 0, 1, 40), 0, beat, 16);
    expect(loose.meanAbsMs!).toBeGreaterThan(38);
    expect(loose.time).toBeLessThan(0.5);
    // Rushing 3% over 16 bars at 120: about 3.7 BPM fast, so time is capped at a half.
    const rushed = gradeImprovise(take(16, 0, 0.97), 0, beat, 16);
    expect(rushed.driftBpm!).toBeGreaterThan(2);
    expect(rushed.time).toBeLessThanOrEqual(0.5);
    expect(rushed.correct).toBe(false);
  });

  it("counts empty bars and different fills", () => {
    const sparse = take(8).filter((h) => h.at < 4 * bar || h.at >= 6 * bar);
    expect(gradeImprovise(sparse, 0, beat, 8).density).toBe(0.75);
    expect(gradeImprovise(take(16, 4), 0, beat, 16).distinctFills).toBe(1);
  });
});
