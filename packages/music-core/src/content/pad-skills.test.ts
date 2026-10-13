import { describe, expect, it } from "vitest";
import {
  echoGroove,
  fillGroove,
  fillReport,
  gradeDynamics,
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
    const fillIdx = g.targets.flatMap((t, i) => (t.beat >= 12 && t.beat < 16 ? [i] : []));
    const per = g.targets.map((_, i) =>
      fillIdx.includes(i) ? -30 : g.landing.includes(i) ? 10 : 0,
    );
    expect(fillReport(g, per)).toMatchObject({
      rushed: true,
      landed: true,
      fillMeanMs: -30,
      landingMs: 10,
    });
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
